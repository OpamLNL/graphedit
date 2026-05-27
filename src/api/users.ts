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

export type LearnerProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface MapLearnerRow {
    uid: string;
    name: string;
    email: string;
    role: string;
    completed: number;
    total: number;
    available: number;
    locked: number;
    percent: number;
    status: LearnerProgressStatus;
}

export interface TeachingOverviewMap {
    id: number;
    title: string;
    description: string | null;
    status: 'draft' | 'published';
    updatedAt: string;
    publishedAt: string | null;
    teachingStats: CabinetMapTeachingStats;
}

export interface TeachingOverviewData {
    summary: CabinetTeachingSummary;
    maps: TeachingOverviewMap[];
}

export interface MapLearnersDetailData {
    map: {
        id: number;
        title: string;
        description: string | null;
        status: 'draft' | 'published';
        publishedAt: string | null;
        updatedAt: string;
    };
    teachingStats: CabinetMapTeachingStats;
    learners: MapLearnerRow[];
}

export interface TeachingLearnerMapProgress {
    mapId: number;
    mapTitle: string;
    completed: number;
    total: number;
    percent: number;
    status: LearnerProgressStatus;
}

export interface TeachingLearnerRow {
    uid: string;
    name: string;
    email: string;
    role: string;
    mapsCount: number;
    averagePercent: number;
    maps: TeachingLearnerMapProgress[];
}

export interface TeachingLearnersData {
    summary: {
        totalLearners: number;
        activeLearners: number;
        publishedMaps: number;
    };
    learners: TeachingLearnerRow[];
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

export interface PublicUserProfileMap {
    id: number;
    title: string;
    description: string | null;
    updatedAt: string;
    publishedAt: string | null;
}

export interface PublicUserProfile {
    id: number;
    name: string;
    role: string;
    avatarUrl: string | null;
    createdAt: string;
    publishedMaps: PublicUserProfileMap[];
    stats: {
        publishedMapsCount: number;
    };
}

export const usersApi = {
    me: () => apiFetch<MeResponse>('/users/me'),

    getPublicProfile: (userId: number) =>
        apiFetch<PublicUserProfile>(`/users/${userId}/profile`),

    getCabinet: () => apiFetch<CabinetData>('/users/me/cabinet'),

    getTeachingOverview: () => apiFetch<TeachingOverviewData>('/users/me/teaching/overview'),

    getTeachingLearners: () => apiFetch<TeachingLearnersData>('/users/me/teaching/learners'),

    getMapLearners: (mapId: number) =>
        apiFetch<MapLearnersDetailData>(`/users/me/teaching/maps/${mapId}/learners`),

    uploadAvatar: (file: File) => {
        const form = new FormData();
        form.append('file', file);
        return apiFetch<MeResponse>('/users/me/avatar', {
            method: 'POST',
            body: form,
        });
    },

    removeAvatar: () => apiFetch<MeResponse>('/users/me/avatar', { method: 'DELETE' }),

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

    grantTeacherRole: (email: string) =>
        apiFetch<{
            id: number;
            email: string;
            name: string;
            role: string;
            message: string;
        }>('/users/grant-teacher', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }),
};
