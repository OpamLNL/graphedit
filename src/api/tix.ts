import { apiFetch } from './client';

export type TixGeneratedCodes = {
    eventNo: number;
    date: string;
    accessCode: string;
    name: string;
    eventId?: number;
    persisted: boolean;
    tickets: { ticketNo: number; code: string }[];
};

export const tixApi = {
    generateCodes: (body: {
        eventNo: number;
        date: string;
        ticketCount: number;
        name?: string;
        persist?: boolean;
    }) =>
        apiFetch<TixGeneratedCodes>('/admin/tix/codes/generate', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
};
