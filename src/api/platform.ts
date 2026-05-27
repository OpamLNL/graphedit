import { apiFetch } from './client';

export interface PlatformStats {
    topics: number;
    nodes: number;
    edges: number;
    revisions: number;
    publishedMaps: number;
    studentsWithProgress: number;
    completedTopicRecords: number;
    averageCompletionPercent: number;
}

export const platformApi = {
    getStats: () => apiFetch<PlatformStats>('/platform/stats', {}, false),
};
