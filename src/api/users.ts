import { apiFetch } from './client';

export interface MeResponse {
    email: string;
    name: string;
    role: string;
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
