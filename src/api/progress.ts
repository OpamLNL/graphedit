import { apiFetch } from './client';

export interface ProgressSummary {
    mapId: number;
    total: number;
    completed: number;
    available: number;
    locked: number;
    percent: number;
    nodes: {
        id: number;
        title: string;
        topicId: number;
        status: 'completed' | 'available' | 'locked';
        level: number;
        progress: number;
    }[];
}

export interface ProgressRecord {
    id: number;
    userUid: string;
    topicId: number;
    status: string;
    progress: number;
    completed_at: string | null;
}

export const progressApi = {
    getMyRecords: () => apiFetch<ProgressRecord[]>('/progress/me'),

    getMySummary: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch<ProgressSummary>(`/progress/me/summary${q}`);
    },

    markTopicComplete: (topicId: number) =>
        apiFetch('/progress/me', {
            method: 'POST',
            body: JSON.stringify({ topicId }),
        }),
};
