import { apiFetch } from './client';

export type TixTicketCode = { ticketNo: number; code: string };

export type TixStats = {
    total: number;
    sold: number;
    used: number;
    remaining: number;
};

export type TixGeneratedCodes = {
    eventNo: number;
    date: string;
    accessCode: string;
    name: string;
    eventId?: number;
    persisted: boolean;
    tickets: TixTicketCode[];
};

export type TixAppendedCodes = {
    eventNo: number | null | undefined;
    date: string;
    name: string;
    eventId: number;
    appendedFrom: number;
    appendedCount: number;
    appended: TixTicketCode[];
    stats: TixStats;
    tickets?: TixTicketCode[];
};

export type TixEventSaved = {
    id: number;
    name: string;
    eventNo?: number | null;
    eventDate?: string | null;
    accessCode: string;
    status: string;
    stats: TixStats;
    tickets?: {
        id: number;
        ticketNo: number;
        barcode: string;
        code?: string;
        sold: boolean;
        soldAt?: string | null;
        usedAt?: string | null;
        usedByUid?: string | null;
    }[];
};

export type TixScanResult = {
    ok: boolean;
    reason: 'ok' | 'already_used' | 'unknown' | 'closed';
    message: string;
    ticket?: {
        id: number;
        ticketNo: number;
        barcode: string;
        usedAt?: string | null;
        usedByUid?: string | null;
    };
    stats: TixStats;
};

export const tixApi = {
    generateCodes: (body: {
        eventNo: number;
        date: string;
        accessCode: string;
        ticketCount: number;
        name?: string;
        persist?: boolean;
    }) =>
        apiFetch<TixGeneratedCodes>('/admin/tix/codes/generate', {
            method: 'POST',
            body: JSON.stringify(body),
        }),

    /** Додати нові квитки до існуючого заходу (номери з продовженням) */
    appendCodes: (body: {
        eventNo: number;
        accessCode: string;
        ticketCount: number;
    }) =>
        apiFetch<TixAppendedCodes>('/admin/tix/codes/append', {
            method: 'POST',
            body: JSON.stringify(body),
        }),

    /** Забити захід + квитки в БД (обовʼязково eventNo + date) */
    saveToDb: (body: {
        name?: string;
        eventNo: number;
        date: string;
        accessCode: string;
        tickets: { ticketNo: number; code: string }[];
    }) =>
        apiFetch<TixEventSaved>('/admin/tix/events/save', {
            method: 'POST',
            body: JSON.stringify({
                name: body.name,
                eventNo: body.eventNo,
                date: body.date,
                accessCode: body.accessCode,
                tickets: body.tickets.map((t) => ({
                    ticketNo: t.ticketNo,
                    code: t.code,
                })),
            }),
        }),

    scan: (body: { eventNo: number; barcode: string }) =>
        apiFetch<TixScanResult>('/admin/tix/scan', {
            method: 'POST',
            body: JSON.stringify(body),
        }),

    getByCode: (accessCode: string, withTickets = false) =>
        apiFetch<TixEventSaved>(
            `/admin/tix/events/by-code/${encodeURIComponent(accessCode)}${
                withTickets ? '?tickets=1' : ''
            }`,
        ),

    getByEventNo: (eventNo: number, withTickets = true) =>
        apiFetch<TixEventSaved>(
            `/admin/tix/events/by-no/${eventNo}${withTickets ? '?tickets=1' : ''}`,
        ),
};
