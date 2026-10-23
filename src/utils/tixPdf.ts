import type { TixTicketCode } from '../api/tix';

export type PdfBarcodeOrientation = 'horizontal' | 'vertical';

export type PdfBarcodeLayout = {
    /** % від ширини шаблону (лівий край) */
    xPercent: number;
    /** % від висоти шаблону (верхній край) */
    yPercent: number;
    /** % від ширини шаблону */
    widthPercent: number;
    /** % від висоти шаблону */
    heightPercent: number;
    /** Горизонтальний (звичайний) або вертикальний (повернутий на 90°) */
    orientation: PdfBarcodeOrientation;
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

function barcodeDataUrl(
    JsBarcode: (canvas: HTMLCanvasElement, code: string, opts: object) => void,
    code: string,
    widthPx: number,
    heightPx: number,
    orientation: PdfBarcodeOrientation,
): string {
    // Підпис = той самий code, що в смужках (не номер квитка)
    const longSide = Math.max(80, Math.round(Math.max(widthPx, heightPx)));
    const shortSide = Math.max(24, Math.round(Math.min(widthPx, heightPx) * 0.72));
    const canvas = document.createElement('canvas');
    const moduleW = Math.max(1, Math.min(4, Math.round(longSide / 120)));
    // Довгий HMAC — дрібніший шрифт, щоб вмістився
    const fontSize = Math.max(8, Math.min(16, Math.round(longSide / Math.max(12, code.length))));
    JsBarcode(canvas, code, {
        format: 'CODE128',
        displayValue: true,
        text: code,
        fontSize,
        textMargin: 2,
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

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не вдалося завантажити зображення шаблону'));
        img.src = src;
    });
}

type PageGeom = {
    widthMm: number;
    heightMm: number;
    orient: 'landscape' | 'portrait';
    fmt: 'JPEG' | 'PNG';
    boxW: number;
    boxH: number;
    boxX: number;
    boxY: number;
    barcodeOrientation: PdfBarcodeOrientation;
};

async function pageGeom(
    templateDataUrl: string,
    layout: PdfBarcodeLayout,
): Promise<PageGeom> {
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
        boxW: (widthMm * layout.widthPercent) / 100,
        boxH: (heightMm * layout.heightPercent) / 100,
        boxX: (widthMm * layout.xPercent) / 100,
        boxY: (heightMm * layout.yPercent) / 100,
        barcodeOrientation: layout.orientation === 'vertical' ? 'vertical' : 'horizontal',
    };
}

function drawTicketPage(
    pdf: JsPdfDoc,
    JsBarcode: (canvas: HTMLCanvasElement, code: string, opts: object) => void,
    templateDataUrl: string,
    ticket: TixTicketCode,
    g: PageGeom,
) {
    pdf.addImage(templateDataUrl, g.fmt, 0, 0, g.widthMm, g.heightMm);
    const bc = barcodeDataUrl(
        JsBarcode,
        ticket.code,
        g.boxW * 8,
        g.boxH * 8,
        g.barcodeOrientation,
    );
    pdf.addImage(bc, 'PNG', g.boxX, g.boxY, g.boxW, g.boxH);
}

function blobFromPdf(pdf: JsPdfDoc): Blob {
    const out = pdf.output('blob');
    if (!(out instanceof Blob)) throw new Error('jspdf.output не повернув Blob');
    return out;
}

/** Один PDF: одна сторінка — один квиток */
export async function buildTicketPdf(
    templateDataUrl: string,
    ticket: TixTicketCode,
    layout: PdfBarcodeLayout,
): Promise<Blob> {
    const [JsPDF, JsBarcode] = await Promise.all([getJsPdfCtor(), getJsBarcode()]);
    const g = await pageGeom(templateDataUrl, layout);
    const pdf = new JsPDF({
        orientation: g.orient,
        unit: 'mm',
        format: [g.widthMm, g.heightMm],
    });
    drawTicketPage(pdf, JsBarcode, templateDataUrl, ticket, g);
    return blobFromPdf(pdf);
}

/** Один PDF: багато сторінок (по квитку) */
export async function buildCombinedTicketPdf(
    templateDataUrl: string,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout,
    onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
    if (!tickets.length) throw new Error('Немає квитків у діапазоні');
    const [JsPDF, JsBarcode] = await Promise.all([getJsPdfCtor(), getJsBarcode()]);
    const g = await pageGeom(templateDataUrl, layout);
    const pdf = new JsPDF({
        orientation: g.orient,
        unit: 'mm',
        format: [g.widthMm, g.heightMm],
    });
    for (let i = 0; i < tickets.length; i += 1) {
        if (i > 0) pdf.addPage([g.widthMm, g.heightMm], g.orient);
        drawTicketPage(pdf, JsBarcode, templateDataUrl, tickets[i], g);
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
    /** Один багатосторінковий PDF замість окремого файлу на квиток */
    combinedPdf: boolean;
    /** Розбити видачу на кілька ZIP */
    splitArchives: boolean;
    /** Квитків (сторінок) в одному ZIP, якщо splitArchives */
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

/** Зібрати ZIP з окремими PDF або з одним multi-page PDF */
async function buildOneZip(
    templateDataUrl: string,
    meta: PdfTicketMeta,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout,
    combinedPdf: boolean,
    onProgress?: (done: number, total: number) => void,
    progressOffset = 0,
    progressTotal?: number,
): Promise<Blob> {
    const JSZip = await getJSZip();
    const zip = new JSZip();
    const total = progressTotal ?? tickets.length;

    if (combinedPdf) {
        const pdf = await buildCombinedTicketPdf(
            templateDataUrl,
            tickets,
            layout,
            (done) => onProgress?.(progressOffset + done, total),
        );
        const fromNo = tickets[0].ticketNo;
        const toNo = tickets[tickets.length - 1].ticketNo;
        zip.file(combinedPdfName(meta, fromNo, toNo), pdf);
    } else {
        let done = 0;
        for (const ticket of tickets) {
            const blob = await buildTicketPdf(templateDataUrl, ticket, layout);
            zip.file(ticketPdfFileName(meta, ticket.ticketNo), blob);
            done += 1;
            onProgress?.(progressOffset + done, total);
        }
    }
    return zip.generateAsync({ type: 'blob' });
}

/** Пакет PDF → один або кілька ZIP (і опційно один загальний PDF у кожному) */
export async function buildTicketsExport(
    templateDataUrl: string,
    meta: PdfTicketMeta,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout,
    options: BuildTicketsExportOptions,
    onProgress?: (done: number, total: number) => void,
): Promise<TicketsExportFile[]> {
    if (!tickets.length) throw new Error('Немає квитків у діапазоні');

    const split =
        options.splitArchives &&
        Number.isFinite(options.ticketsPerArchive) &&
        options.ticketsPerArchive >= 1;

    // Один загальний PDF без розбиття на архіви — одразу .pdf
    if (options.combinedPdf && !split) {
        const blob = await buildCombinedTicketPdf(
            templateDataUrl,
            tickets,
            layout,
            onProgress,
        );
        const fromNo = tickets[0].ticketNo;
        const toNo = tickets[tickets.length - 1].ticketNo;
        return [{ fileName: combinedPdfName(meta, fromNo, toNo), blob }];
    }

    const chunks = split ? chunkTickets(tickets, options.ticketsPerArchive) : [tickets];
    const files: TicketsExportFile[] = [];
    let offset = 0;
    for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i];
        const blob = await buildOneZip(
            templateDataUrl,
            meta,
            chunk,
            layout,
            options.combinedPdf,
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
    return files;
}

/** @deprecated — використовуй buildTicketsExport */
export async function buildTicketsZip(
    templateDataUrl: string,
    meta: PdfTicketMeta,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout,
    onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
    const files = await buildTicketsExport(
        templateDataUrl,
        meta,
        tickets,
        layout,
        { combinedPdf: false, splitArchives: false, ticketsPerArchive: tickets.length },
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

/** Кілька файлів підряд (з невеликою паузою — інакше браузер глушить) */
export async function downloadBlobs(files: TicketsExportFile[]) {
    for (let i = 0; i < files.length; i += 1) {
        downloadBlob(files[i].blob, files[i].fileName);
        if (i < files.length - 1) {
            await new Promise((r) => setTimeout(r, 400));
        }
    }
}
