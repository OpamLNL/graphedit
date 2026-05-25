import { apiFetch } from './client';

export interface MeResponse {
    id: number;
    email: string;
    name: string;
    role: string;
    avatarUrl: string | null;
    createdAt: string;
}

export interface CabinetMapProgress {
    total: number;
    completed: number;
    available: number;
    locked: number;
    percent: number;
}

export interface CabinetMapItem {
    id: number;
    title: string;
    description: string | null;
    status: 'draft' | 'published';
    updatedAt: string;
    ownerUid: string | null;
    progress: CabinetMapProgress | null;
}

export interface CabinetData {
    user: MeResponse;
    stats: {
        totalCompletedTopics: number;
        mapsTotal: number;
        mapsWithProgress: number;
        averagePercent: number;
    };
    maps: CabinetMapItem[];
    recentCompleted: {
        topicId: number;
        completedAt: string | null;
        title: string;
        mapId: number | null;
    }[];
}

export interface UserRecord {
    id: number;
    email: string;
    name: string;
    role: string;
    firebaseUid?: string;
    completionPercent?: number;
    completedTopics?: number;
}

export const usersApi = {
    me: () => apiFetch<MeResponse>('/users/me'),

    getCabinet: () => apiFetch<CabinetData>('/users/me/cabinet'),

    saveAfterGoogle: (body: {
        email: string;
        name: string;
        avatarUrl?: string | null;
    }) =>
        apiFetch('/users/save', {
            method: 'POST',
            body: JSON.stringify(body),
        }, true),

    getAll: () => apiFetch<UserRecord[]>('/users'),

    updateRole: (userId: number, role: string) =>
        apiFetch(`/users/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role }),
        }),
};
