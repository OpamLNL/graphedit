import type { TixTicketCode } from '../api/tix';

export type PdfBarcodeOrientation = 'horizontal' | 'vertical';

export type PdfBoxLayout = {
    /** % від ширини шаблону (лівий край) */
    xPercent: number;
    /** % від висоти шаблону (верхній край) */
    yPercent: number;
    /** % від ширини шаблону */
    widthPercent: number;
    /** % від висоти шаблону */
    heightPercent: number;
};

export type PdfBarcodeLayout = PdfBoxLayout & {
    /** Горизонтальний (звичайний) або вертикальний (повернутий на 90°) */
    orientation: PdfBarcodeOrientation;
};

export type PdfNumberLayout = PdfBoxLayout & {
    /** Малювати номер квитка */
    enabled: boolean;
};

export type PdfTicketLayout = {
    barcode: PdfBarcodeLayout;
    ticketNo: PdfNumberLayout;
};

export type PdfTicketMeta = {
    eventNo: string;
    eventName: string;
    eventDate?: string;
};

function sanitizeFilePart(value: string): string {
    return (
        value
            .trim()
            .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 80) || 'ticket'
    );
}

export function ticketPdfFileName(meta: PdfTicketMeta, ticketNo: number): string {
    const no = sanitizeFilePart(meta.eventNo);
    const name = sanitizeFilePart(meta.eventName || 'event');
    return `${no}_${name}_${ticketNo}.pdf`;
}

async function getJsBarcode(): Promise<(canvas: HTMLCanvasElement, code: string, opts: object) => void> {
    const mod = await import('jsbarcode');
    const fn = (mod as { default?: unknown }).default ?? mod;
    if (typeof fn !== 'function') {
        throw new Error('jsbarcode не завантажився');
    }
    return fn as (canvas: HTMLCanvasElement, code: string, opts: object) => void;
}

type JsPdfDoc = {
    addImage: (...args: unknown[]) => void;
    addPage: (...args: unknown[]) => void;
    setFont: (...args: unknown[]) => void;
    setFontSize: (size: number) => void;
    setTextColor: (...args: unknown[]) => void;
    setDrawColor: (...args: unknown[]) => void;
    setFillColor: (...args: unknown[]) => void;
    rect: (...args: unknown[]) => void;
    text: (...args: unknown[]) => void;
    getTextWidth: (text: string) => number;
    output: (type: string) => Blob;
};

async function getJsPdfCtor(): Promise<new (opts: object) => JsPdfDoc> {
    const mod = await import('jspdf');
    const ctor =
        (mod as { jsPDF?: unknown }).jsPDF ??
        (mod as { default?: { jsPDF?: unknown } }).default?.jsPDF ??
        (mod as { default?: unknown }).default;
    if (typeof ctor !== 'function') {
        throw new Error('jspdf не завантажився');
    }
    return ctor as new (opts: object) => JsPdfDoc;
}

async function getJSZip(): Promise<new () => {
    file: (name: string, data: Blob) => void;
    generateAsync: (opts: { type: string }) => Promise<Blob>;
}> {
    const mod = await import('jszip');
    const ctor = (mod as { default?: unknown }).default ?? mod;
    if (typeof ctor !== 'function') {
        throw new Error('jszip не завантажився');
    }
    return ctor as new () => {
        file: (name: string, data: Blob) => void;
        generateAsync: (opts: { type: string }) => Promise<Blob>;
    };
}

/** Лише смужки Code128 (без підпису JsBarcode — його text часто ігнорується/обрізається). */
function barcodeBarsDataUrl(
    JsBarcode: (canvas: HTMLCanvasElement, code: string, opts: object) => void,
    code: string,
    widthPx: number,
    heightPx: number,
    orientation: PdfBarcodeOrientation,
): string {
    const longSide = Math.max(80, Math.round(Math.max(widthPx, heightPx)));
    const shortSide = Math.max(24, Math.round(Math.min(widthPx, heightPx)));
    const canvas = document.createElement('canvas');
    const moduleW = Math.max(1, Math.min(4, Math.round(longSide / 120)));
    JsBarcode(canvas, code, {
        format: 'CODE128',
        displayValue: false,
        margin: 6,
        width: moduleW,
        height: shortSide,
        background: '#ffffff',
        lineColor: '#000000',
    });

    if (orientation !== 'vertical') {
        return canvas.toDataURL('image/png');
    }

    const rotated = document.createElement('canvas');
    rotated.width = canvas.height;
    rotated.height = canvas.width;
    const ctx = rotated.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');
    ctx.translate(rotated.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, 0, 0);
    return rotated.toDataURL('image/png');
}

/** Підпис під барами: «номер  хеш» — fillText на сторінці, не JsBarcode.text */
function paintBarcodeCaption(
    ctx: CanvasRenderingContext2D,
    box: { x: number; y: number; w: number; h: number },
    ticketNo: number,
    code: string,
) {
    const label = `${ticketNo}  ${code}`;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = Math.max(16, Math.min(40, Math.floor(box.h * 0.72)));
    while (fontSize >= 12) {
        ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
        if (ctx.measureText(label).width <= box.w * 0.96) break;
        fontSize -= 1;
    }
    ctx.fillText(label, box.x + box.w / 2, box.y + box.h / 2);
    ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не вдалося завантажити зображення шаблону'));
        img.src = src;
    });
}

/** Нормалізує layout. Окрема рамка номера вимкнена — номер лише під штрихкодом. */
export function asTicketLayout(layout: PdfBarcodeLayout | PdfTicketLayout): PdfTicketLayout {
    const disabledNo: PdfNumberLayout = {
        enabled: false,
        xPercent: 42,
        yPercent: 58,
        widthPercent: 16,
        heightPercent: 5,
    };
    if (layout && typeof layout === 'object' && 'barcode' in layout) {
        const L = layout as PdfTicketLayout;
        if (L.barcode) {
            return { barcode: L.barcode, ticketNo: disabledNo };
        }
    }
    return { barcode: layout as PdfBarcodeLayout, ticketNo: disabledNo };
}

type PageGeom = {
    widthMm: number;
    heightMm: number;
    orient: 'landscape' | 'portrait';
    fmt: 'JPEG' | 'PNG';
};

async function pageGeom(templateDataUrl: string): Promise<PageGeom> {
    const img = await loadImage(templateDataUrl);
    const pageWpx = img.naturalWidth || img.width;
    const pageHpx = img.naturalHeight || img.height;
    if (!pageWpx || !pageHpx) throw new Error('Порожній шаблон');

    const widthMm = 210;
    const heightMm = (pageHpx / pageWpx) * widthMm;
    return {
        widthMm,
        heightMm,
        orient: widthMm >= heightMm ? 'landscape' : 'portrait',
        fmt: templateDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG',
    };
}

function boxPx(
    pageW: number,
    pageH: number,
    box: PdfBoxLayout,
): { x: number; y: number; w: number; h: number } {
    return {
        x: (box.xPercent / 100) * pageW,
        y: (box.yPercent / 100) * pageH,
        w: Math.max(1, (box.widthPercent / 100) * pageW),
        h: Math.max(1, (box.heightPercent / 100) * pageH),
    };
}

/**
 * Уся сторінка квитка = один canvas → JPEG у PDF.
 * Номер квитка лише під штрихкодом: «номер  хеш» (окремої рамки номера немає).
 */
async function renderTicketPageDataUrl(
    templateImg: HTMLImageElement,
    JsBarcode: (canvas: HTMLCanvasElement, code: string, opts: object) => void,
    ticket: TixTicketCode,
    layout: PdfTicketLayout,
): Promise<string> {
    const pageW = templateImg.naturalWidth || templateImg.width;
    const pageH = templateImg.naturalHeight || templateImg.height;
    if (!pageW || !pageH) throw new Error('Порожній шаблон');

    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступний');

    ctx.drawImage(templateImg, 0, 0, pageW, pageH);

    const bb = boxPx(pageW, pageH, layout.barcode);
    const orientation =
        layout.barcode.orientation === 'vertical' ? 'vertical' : 'horizontal';
    const captionH = Math.max(22, Math.round(bb.h * 0.3));
    const barsH = Math.max(24, bb.h - captionH);
    const bcUrl = barcodeBarsDataUrl(JsBarcode, ticket.code, bb.w, barsH, orientation);
    const bcImg = await loadImage(bcUrl);
    ctx.drawImage(bcImg, bb.x, bb.y, bb.w, barsH);
    paintBarcodeCaption(
        ctx,
        { x: bb.x, y: bb.y + barsH, w: bb.w, h: bb.h - barsH },
        ticket.ticketNo,
        ticket.code,
    );

    return canvas.toDataURL('image/jpeg', 0.93);
}

function blobFromPdf(pdf: JsPdfDoc): Blob {
    const out = pdf.output('blob');
    if (!(out instanceof Blob)) throw new Error('jspdf.output не повернув Blob');
    return out;
}

async function addRasterPage(
    pdf: JsPdfDoc,
    pageDataUrl: string,
    g: PageGeom,
    isFirst: boolean,
) {
    if (!isFirst) pdf.addPage([g.widthMm, g.heightMm], g.orient);
    pdf.addImage(pageDataUrl, 'JPEG', 0, 0, g.widthMm, g.heightMm);
}

/** Один PDF: одна сторінка — один квиток */
export async function buildTicketPdf(
    templateDataUrl: string,
    ticket: TixTicketCode,
    layout: PdfBarcodeLayout | PdfTicketLayout,
): Promise<Blob> {
    const full = asTicketLayout(layout);
    const [JsPDF, JsBarcode, templateImg] = await Promise.all([
        getJsPdfCtor(),
        getJsBarcode(),
        loadImage(templateDataUrl),
    ]);
    const g = await pageGeom(templateDataUrl);
    const pageUrl = await renderTicketPageDataUrl(templateImg, JsBarcode, ticket, full);
    const pdf = new JsPDF({
        orientation: g.orient,
        unit: 'mm',
        format: [g.widthMm, g.heightMm],
    });
    addRasterPage(pdf, pageUrl, g, true);
    return blobFromPdf(pdf);
}

/** Один PDF: багато сторінок (по квитку) */
export async function buildCombinedTicketPdf(
    templateDataUrl: string,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout | PdfTicketLayout,
    onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
    if (!tickets.length) throw new Error('Немає квитків у діапазоні');
    const full = asTicketLayout(layout);
    const [JsPDF, JsBarcode, templateImg] = await Promise.all([
        getJsPdfCtor(),
        getJsBarcode(),
        loadImage(templateDataUrl),
    ]);
    const g = await pageGeom(templateDataUrl);
    const pdf = new JsPDF({
        orientation: g.orient,
        unit: 'mm',
        format: [g.widthMm, g.heightMm],
    });
    for (let i = 0; i < tickets.length; i += 1) {
        const pageUrl = await renderTicketPageDataUrl(
            templateImg,
            JsBarcode,
            tickets[i],
            full,
        );
        addRasterPage(pdf, pageUrl, g, i === 0);
        onProgress?.(i + 1, tickets.length);
    }
    return blobFromPdf(pdf);
}

export function filterTicketsByRange(
    tickets: TixTicketCode[],
    fromNo: number,
    toNo: number,
): TixTicketCode[] {
    const from = Math.min(fromNo, toNo);
    const to = Math.max(fromNo, toNo);
    return tickets
        .filter((t) => t.ticketNo >= from && t.ticketNo <= to)
        .sort((a, b) => a.ticketNo - b.ticketNo);
}

export function chunkTickets<T>(items: T[], size: number): T[][] {
    const n = Math.max(1, Math.floor(size));
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += n) {
        chunks.push(items.slice(i, i + n));
    }
    return chunks;
}

export type BuildTicketsExportOptions = {
    /** Окремі PDF у ZIP (можна вимкнути) */
    individualPdfs: boolean;
    /** Спільний PDF на діапазон — незалежно від окремих */
    combinedPdf: boolean;
    /** Розбити окремі PDF на кілька ZIP */
    splitArchives: boolean;
    /** Квитків в одному ZIP, якщо splitArchives */
    ticketsPerArchive: number;
};

export type TicketsExportFile = {
    fileName: string;
    blob: Blob;
};

function zipBaseName(meta: PdfTicketMeta): string {
    const no = sanitizeFilePart(meta.eventNo);
    const name = sanitizeFilePart(meta.eventName || 'tickets');
    return `${no}_${name}`;
}

function combinedPdfName(meta: PdfTicketMeta, fromNo: number, toNo: number): string {
    return `${zipBaseName(meta)}_${fromNo}-${toNo}.pdf`;
}

function zipName(meta: PdfTicketMeta, part: number, parts: number, fromNo: number, toNo: number): string {
    const base = zipBaseName(meta);
    if (parts <= 1) return `${base}_pdf.zip`;
    return `${base}_pdf_part${part}of${parts}_${fromNo}-${toNo}.zip`;
}

async function buildOneZip(
    templateDataUrl: string,
    meta: PdfTicketMeta,
    tickets: TixTicketCode[],
    layout: PdfTicketLayout,
    onProgress?: (done: number, total: number) => void,
    progressOffset = 0,
    progressTotal?: number,
): Promise<Blob> {
    const JSZip = await getJSZip();
    const zip = new JSZip();
    const total = progressTotal ?? tickets.length;

    let done = 0;
    for (const ticket of tickets) {
        const blob = await buildTicketPdf(templateDataUrl, ticket, layout);
        zip.file(ticketPdfFileName(meta, ticket.ticketNo), blob);
        done += 1;
        onProgress?.(progressOffset + done, total);
    }

    return zip.generateAsync({ type: 'blob' });
}

/**
 * individualPdfs і combinedPdf — незалежні.
 * Можна згенерувати лише спільний PDF, лише ZIP, або обидва.
 */
export async function buildTicketsExport(
    templateDataUrl: string,
    meta: PdfTicketMeta,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout | PdfTicketLayout,
    options: BuildTicketsExportOptions,
    onProgress?: (done: number, total: number) => void,
): Promise<TicketsExportFile[]> {
    if (!tickets.length) throw new Error('Немає квитків у діапазоні');
    if (!options.individualPdfs && !options.combinedPdf) {
        throw new Error('Увімкни окремі PDF і/або спільний PDF');
    }

    const full = asTicketLayout(layout);
    const files: TicketsExportFile[] = [];

    if (options.individualPdfs) {
        const split =
            options.splitArchives &&
            Number.isFinite(options.ticketsPerArchive) &&
            options.ticketsPerArchive >= 1;
        const chunks = split ? chunkTickets(tickets, options.ticketsPerArchive) : [tickets];
        let offset = 0;
        for (let i = 0; i < chunks.length; i += 1) {
            const chunk = chunks[i];
            const blob = await buildOneZip(
                templateDataUrl,
                meta,
                chunk,
                full,
                onProgress,
                offset,
                tickets.length,
            );
            const fromNo = chunk[0].ticketNo;
            const toNo = chunk[chunk.length - 1].ticketNo;
            files.push({
                fileName: zipName(meta, i + 1, chunks.length, fromNo, toNo),
                blob,
            });
            offset += chunk.length;
        }
    }

    if (options.combinedPdf) {
        const combined = await buildCombinedTicketPdf(
            templateDataUrl,
            tickets,
            full,
            options.individualPdfs
                ? undefined
                : onProgress,
        );
        const fromNo = tickets[0].ticketNo;
        const toNo = tickets[tickets.length - 1].ticketNo;
        files.push({
            fileName: combinedPdfName(meta, fromNo, toNo),
            blob: combined,
        });
    }

    return files;
}

/** @deprecated — використовуй buildTicketsExport */
export async function buildTicketsZip(
    templateDataUrl: string,
    meta: PdfTicketMeta,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout | PdfTicketLayout,
    onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
    const files = await buildTicketsExport(
        templateDataUrl,
        meta,
        tickets,
        layout,
        {
            individualPdfs: true,
            combinedPdf: false,
            splitArchives: false,
            ticketsPerArchive: tickets.length,
        },
        onProgress,
    );
    return files[0].blob;
}

export function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}

export async function downloadBlobs(files: TicketsExportFile[]) {
    for (let i = 0; i < files.length; i += 1) {
        downloadBlob(files[i].blob, files[i].fileName);
        if (i < files.length - 1) {
            await new Promise((r) => setTimeout(r, 400));
        }
    }
}
