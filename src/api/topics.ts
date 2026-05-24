import { apiFetch } from './client';

export interface Topic {
    id: number;
    title: string;
    description: string;
}

export const topicsApi = {
    getAll: () => apiFetch<Topic[]>('/topics', {}, false),

    getOne: (id: number) => apiFetch<Topic>(`/topics/${id}`, {}, false),
};
