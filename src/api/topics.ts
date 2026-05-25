import { apiFetch } from './client';

export interface Topic {
    id: number;
    title: string;
    description: string;
    groupId?: string | null;
    orderInGroup?: number;
    globalOrder?: number | null;
}

export interface CreateTopicPayload {
    title: string;
    description: string;
    groupId?: string;
}

export interface TopicCatalogMapRef {
    mapId: number;
    mapTitle: string;
    mapStatus: 'draft' | 'published';
    nodeId: number;
    nodeTitle: string;
}

export interface TopicCatalogItem {
    id: number;
    title: string;
    description: string;
    groupId: string | null;
    maps: TopicCatalogMapRef[];
    mapsCount: number;
}

export interface TopicCatalogResult {
    data: TopicCatalogItem[];
    total: number;
    page: number;
    limit: number;
    availableMaps: { id: number; title: string; status: 'draft' | 'published' }[];
}

export interface TopicCatalogParams {
    search?: string;
    mapId?: number;
    publishedOnly?: boolean;
    usedOnly?: boolean;
    sortBy?: 'title' | 'maps';
    page?: number;
    limit?: number;
}

export const topicsApi = {
    getAll: () => apiFetch<Topic[]>('/topics', {}, false),

    getCatalog: (params: TopicCatalogParams = {}) => {
        const q = new URLSearchParams();
        if (params.search) q.set('search', params.search);
        if (params.mapId != null) q.set('mapId', String(params.mapId));
        if (params.publishedOnly === true) q.set('publishedOnly', 'true');
        if (params.publishedOnly === false) q.set('publishedOnly', 'false');
        if (params.usedOnly === true) q.set('usedOnly', 'true');
        if (params.usedOnly === false) q.set('usedOnly', 'false');
        if (params.sortBy) q.set('sortBy', params.sortBy);
        if (params.page != null) q.set('page', String(params.page));
        if (params.limit != null) q.set('limit', String(params.limit));
        const query = q.toString();
        return apiFetch<TopicCatalogResult>(`/topics/catalog${query ? `?${query}` : ''}`, {}, false);
    },

    getOne: (id: number) => apiFetch<Topic>(`/topics/${id}`, {}, false),

    create: (payload: CreateTopicPayload) =>
        apiFetch<Topic>('/topics', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
};
