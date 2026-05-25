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

export interface CabinetMapTeachingStats {
    nodeCount: number;
    studentsTotal: number;
    studentsActive: number;
    averagePercent: number;
    completionDistribution: {
        notStarted: number;
        inProgress: number;
        completed: number;
    };
    topStudents: {
        name: string;
        email: string;
        percent: number;
        completed: number;
        total: number;
    }[];
}

export interface CabinetMapItem {
    id: number;
    title: string;
    description: string | null;
    status: 'draft' | 'published';
    updatedAt: string;
    ownerUid: string | null;
    progress: CabinetMapProgress | null;
    teachingStats: CabinetMapTeachingStats | null;
}

export interface CabinetTeachingSummary {
    publishedMaps: number;
    studentsActive: number;
    averagePercent: number;
    completedFully: number;
}

export interface CabinetData {
    user: MeResponse;
    stats: {
        totalCompletedTopics: number;
        mapsTotal: number;
        mapsWithProgress: number;
        averagePercent: number;
    };
    teachingStats: CabinetTeachingSummary | null;
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
