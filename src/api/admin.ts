import { apiFetch } from './client';

export interface AdminDashboard {
    users: {
        total: number;
        students: number;
        teachers: number;
        admins: number;
        activeWithProgress: number;
    };
    maps: { total: number; published: number; draft: number };
    content: { topics: number; nodes: number; edges: number };
    progress: {
        completedRecords: number;
        averageCompletionPercent: number;
        defaultMapId: number | null;
    };
    recentCompletions: {
        id: number;
        userUid: string;
        topicId: number;
        completedAt: string | null;
    }[];
}

export const adminApi = {
    getDashboard: () => apiFetch<AdminDashboard>('/admin/dashboard'),

    getUsersStats: (page = 1, limit = 20) =>
        apiFetch<{ data: unknown[]; total: number; page: number; limit: number }>(
            `/admin/statistics/users?page=${page}&limit=${limit}`,
        ),

    getMapsOverview: () => apiFetch('/admin/statistics/maps'),

    getMapStats: (mapId: number) => apiFetch(`/admin/statistics/maps/${mapId}`),
};
