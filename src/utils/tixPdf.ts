import type { TixTicketCode } from '../api/tix';

export type PdfBarcodeLayout = {
    /** % від ширини шаблону (лівий край) */
    xPercent: number;
    /** % від висоти шаблону (верхній край) */
    yPercent: number;
    /** % від ширини шаблону */
    widthPercent: number;
    /** % від висоти шаблону */
    heightPercent: number;
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

async function getJsPdfCtor(): Promise<new (opts: object) => {
    addImage: (...args: unknown[]) => void;
    output: (type: string) => Blob;
}> {
    const mod = await import('jspdf');
    const ctor =
        (mod as { jsPDF?: unknown }).jsPDF ??
        (mod as { default?: { jsPDF?: unknown } }).default?.jsPDF ??
        (mod as { default?: unknown }).default;
    if (typeof ctor !== 'function') {
        throw new Error('jspdf не завантажився');
    }
    return ctor as new (opts: object) => {
        addImage: (...args: unknown[]) => void;
        output: (type: string) => Blob;
    };
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
): string {
    const canvas = document.createElement('canvas');
    const barH = Math.max(20, Math.round(heightPx));
    const moduleW = Math.max(1, Math.min(4, Math.round(widthPx / 120)));
    JsBarcode(canvas, code, {
        format: 'CODE128',
        displayValue: false,
        margin: 8,
        width: moduleW,
        height: barH,
        background: '#ffffff',
        lineColor: '#000000',
    });
    return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не вдалося завантажити зображення шаблону'));
        img.src = src;
    });
}

/** Один PDF: шаблон + штрихкод у заданій позиції */
export async function buildTicketPdf(
    templateDataUrl: string,
    ticket: TixTicketCode,
    layout: PdfBarcodeLayout,
): Promise<Blob> {
    const [JsPDF, JsBarcode] = await Promise.all([getJsPdfCtor(), getJsBarcode()]);
    const img = await loadImage(templateDataUrl);
    const pageWpx = img.naturalWidth || img.width;
    const pageHpx = img.naturalHeight || img.height;
    if (!pageWpx || !pageHpx) throw new Error('Порожній шаблон');

    // mm — стабільніше за px у різних збірках jspdf
    const widthMm = 210;
    const heightMm = (pageHpx / pageWpx) * widthMm;

    const pdf = new JsPDF({
        orientation: widthMm >= heightMm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [widthMm, heightMm],
    });

    const fmt = templateDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    pdf.addImage(templateDataUrl, fmt, 0, 0, widthMm, heightMm);

    const boxW = (widthMm * layout.widthPercent) / 100;
    const boxH = (heightMm * layout.heightPercent) / 100;
    const boxX = (widthMm * layout.xPercent) / 100;
    const boxY = (heightMm * layout.yPercent) / 100;

    const bc = barcodeDataUrl(JsBarcode, ticket.code, boxW * 8, boxH * 8);
    pdf.addImage(bc, 'PNG', boxX, boxY, boxW, boxH);

    const out = pdf.output('blob');
    if (!(out instanceof Blob)) {
        throw new Error('jspdf.output не повернув Blob');
    }
    return out;
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

/** Пакет PDF → ZIP */
export async function buildTicketsZip(
    templateDataUrl: string,
    meta: PdfTicketMeta,
    tickets: TixTicketCode[],
    layout: PdfBarcodeLayout,
    onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
    if (!tickets.length) throw new Error('Немає квитків у діапазоні');
    const JSZip = await getJSZip();
    const zip = new JSZip();
    let done = 0;
    for (const ticket of tickets) {
        const blob = await buildTicketPdf(templateDataUrl, ticket, layout);
        zip.file(ticketPdfFileName(meta, ticket.ticketNo), blob);
        done += 1;
        onProgress?.(done, tickets.length);
    }
    return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
}
