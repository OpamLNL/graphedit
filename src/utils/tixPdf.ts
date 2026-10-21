import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import JSZip from 'jszip';
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
    return value
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80) || 'ticket';
}

export function ticketPdfFileName(meta: PdfTicketMeta, ticketNo: number): string {
    const no = sanitizeFilePart(meta.eventNo);
    const name = sanitizeFilePart(meta.eventName || 'event');
    return `${no}_${name}_${ticketNo}.pdf`;
}

function barcodeDataUrl(code: string, widthPx: number, heightPx: number): string {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, code, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: Math.max(1, Math.round(widthPx / Math.max(code.length * 11, 80))),
        height: Math.max(20, Math.round(heightPx)),
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
    const img = await loadImage(templateDataUrl);
    const pageW = img.naturalWidth || img.width;
    const pageH = img.naturalHeight || img.height;
    if (!pageW || !pageH) throw new Error('Порожній шаблон');

    const pdf = new jsPDF({
        orientation: pageW >= pageH ? 'landscape' : 'portrait',
        unit: 'px',
        format: [pageW, pageH],
        hotfixes: ['px_scaling'],
    });

    pdf.addImage(templateDataUrl, 'PNG', 0, 0, pageW, pageH);

    const boxW = (pageW * layout.widthPercent) / 100;
    const boxH = (pageH * layout.heightPercent) / 100;
    const boxX = (pageW * layout.xPercent) / 100;
    const boxY = (pageH * layout.yPercent) / 100;

    const bc = barcodeDataUrl(ticket.code, boxW * 2, boxH * 2);
    pdf.addImage(bc, 'PNG', boxX, boxY, boxW, boxH);

    return pdf.output('blob');
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
