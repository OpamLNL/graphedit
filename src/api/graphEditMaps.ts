import { apiFetch } from './client';

export interface MapListProgress {
    total: number;
    completed: number;
    available: number;
    locked: number;
    percent: number;
}

export interface MapListAuthor {
    id: number | null;
    uid: string;
    name: string | null;
    email: string | null;
    displayName: string;
}

export interface MapListEngagement {
    averageRating: number | null;
    ratingsCount: number;
    favoritesCount: number;
    myRating: number | null;
    isFavorite: boolean;
    favoritedAt: string | null;
}

export type MapCatalogSortBy =
    | 'title'
    | 'updatedAt'
    | 'publishedAt'
    | 'createdAt'
    | 'rating'
    | 'favorites'
    | 'favoritedAt';

export type MapCatalogSortOrder = 'asc' | 'desc';

export interface MapCatalogQuery {
    search?: string;
    favoritesOnly?: boolean;
    minRating?: number;
    authorId?: number;
    status?: 'draft' | 'published';
    validatedOnly?: boolean;
    sortBy?: MapCatalogSortBy;
    sortOrder?: MapCatalogSortOrder;
}

export interface GraphEditMap {
    id: number;
    title: string;
    description: string | null;
    ownerUid: string | null;
    status: 'draft' | 'published';
    graphValidated?: boolean | null;
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    /** Заповнюється в list / listMine */
    author: MapListAuthor;
    myProgress?: MapListProgress | null;
    engagement?: MapListEngagement;
}

export interface EditorGraphNode {
    id: number;
    title: string;
    topicId: number | null;
    groupId?: string | null;
    x: number | null;
    y: number | null;
    color: string | null;
}

export interface EditorGraphEdge {
    id: number;
    fromNodeId: number;
    toNodeId: number;
    type: string | null;
}

export interface EditorGraphResponse {
    mapId: number;
    nodes: EditorGraphNode[];
    edges: EditorGraphEdge[];
}

export interface GraphValidationNodeIssue {
    nodeId: number;
    nodeTitle: string;
    problems: string[];
}

export interface GraphValidationGroupBucket {
    groupId: string | null;
    groupTitle: string;
    nodes: GraphValidationNodeIssue[];
}

export interface GraphValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    globalIssues: string[];
    groups: GraphValidationGroupBucket[];
}

export interface BulkSavePayload {
    nodes: {
        id?: number;
        title: string;
        topicId?: number | null;
        groupId?: string | null;
        x?: number | null;
        y?: number | null;
        color?: string | null;
    }[];
    edges: {
        id?: number;
        fromNodeId: number;
        toNodeId: number;
        type?: string | null;
    }[];
    groups?: {
        id: string;
        title: string;
        description?: string | null;
        level?: number;
        sortOrder?: number;
        parentId?: string | null;
    }[];
    groupEdges?: {
        id?: number;
        fromGroupId: string;
        toGroupId: string;
        type?: string | null;
    }[];
    deletedNodeIds?: number[];
    deletedEdgeIds?: number[];
    deletedGroupEdgeIds?: number[];
    deletedGroupIds?: string[];
    groupLayouts?: {
        groupId: string;
        x: number;
        y: number;
    }[];
    createRevision?: boolean;
    revisionComment?: string;
}

export interface ImportLibraryMap {
    id: number;
    title: string;
    status: 'draft' | 'published';
}

export interface ImportLibraryGroup {
    id: string;
    title: string;
    description: string | null;
    level: number;
    sortOrder: number;
    mapId: number;
    mapTitle: string;
    nodeCount: number;
}

export interface ImportLibraryNode {
    id: number;
    title: string;
    mapId: number;
    mapTitle: string;
    groupId: string | null;
    groupTitle: string | null;
    topicId: number | null;
}

export interface ImportLibraryResponse {
    maps: ImportLibraryMap[];
    groups: ImportLibraryGroup[];
    nodes: ImportLibraryNode[];
}

export interface ValidateGraphPayload {
    nodes: { id: number; title: string; groupId?: string | null }[];
    edges: { from: number; to: number }[];
    groups?: { id: string; title: string }[];
}

export interface MapJsonMedia {
    caption: string | null;
    sortOrder: number;
    url?: string;
    dataBase64?: string;
    mimeType?: string;
}

export interface MapJsonExport {
    formatVersion: number;
    exportedAt: string;
    map: { title: string; description: string | null };
    groups: {
        id: string;
        title: string;
        description: string | null;
        level: number;
        sortOrder: number;
        parentId: string | null;
    }[];
    groupEdges: { from: string; to: string; type: string | null }[];
    groupLayout: Record<string, { x: number; y: number }>;
    nodes: {
        key: string;
        title: string;
        groupId: string | null;
        x: number | null;
        y: number | null;
        color: string | null;
        theoryMd: string | null;
        media: MapJsonMedia[];
    }[];
    edges: { from: string; to: string; type: string | null }[];
    mediaNote?: string;
    mediaStats?: { embeddedImages: number; skippedImages: number };
}

export type MapJsonImportPayload = MapJsonExport & {
    importMode?: 'merge' | 'replace';
};

export interface MapJsonImportResult {
    mapId: number;
    importMode: 'merge' | 'replace';
    importedNodes: number;
    importedEdges: number;
    graph: EditorGraphResponse;
}

export interface MapRevision {
    id: number;
    mapId: number;
    snapshotJson: {
        nodes: EditorGraphNode[];
        edges: EditorGraphEdge[];
    };
    comment: string | null;
    createdByUid: string | null;
    createdAt: string;
}

function buildCatalogQuery(params?: MapCatalogQuery): string {
    if (!params) return '';
    const qs = new URLSearchParams();
    if (params.search?.trim()) qs.set('search', params.search.trim());
    if (params.favoritesOnly) qs.set('favoritesOnly', 'true');
    if (params.minRating != null) qs.set('minRating', String(params.minRating));
    if (params.authorId != null) qs.set('authorId', String(params.authorId));
    if (params.status) qs.set('status', params.status);
    if (params.validatedOnly) qs.set('validatedOnly', 'true');
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
    const s = qs.toString();
    return s ? `?${s}` : '';
}

export const graphEditMapsApi = {
    /** Каталог: усі опубліковані карти */
    list: (params?: MapCatalogQuery) =>
        apiFetch<GraphEditMap[]>(`/graph-edit-maps${buildCatalogQuery(params)}`),

    /** Мої карти: створені + з прогресом проходження */
    listMine: (params?: MapCatalogQuery) =>
        apiFetch<GraphEditMap[]>(`/graph-edit-maps/mine${buildCatalogQuery(params)}`),

    /** Улюблені опубліковані карти */
    listFavorites: (params?: MapCatalogQuery) =>
        apiFetch<GraphEditMap[]>(`/graph-edit-maps/favorites${buildCatalogQuery(params)}`),

    setFavorite: (id: number, favorite: boolean) =>
        apiFetch<MapListEngagement>(`/graph-edit-maps/${id}/favorite`, {
            method: 'PUT',
            body: JSON.stringify({ favorite }),
        }),

    setRating: (id: number, rating: number | null) =>
        apiFetch<MapListEngagement>(`/graph-edit-maps/${id}/rating`, {
            method: 'PUT',
            body: JSON.stringify({ rating }),
        }),

    getOne: (id: number) => apiFetch<GraphEditMap>(`/graph-edit-maps/${id}`),

    create: (body: { title: string; description?: string }) =>
        apiFetch<GraphEditMap>('/graph-edit-maps', {
            method: 'POST',
            body: JSON.stringify(body),
        }),

    getEditorGraph: (id: number) =>
        apiFetch<EditorGraphResponse>(`/graph-edit-maps/${id}/graph`),

    getImportLibrary: (id: number, params?: { search?: string; sourceMapId?: number }) => {
        const qs = new URLSearchParams();
        if (params?.search?.trim()) qs.set('search', params.search.trim());
        if (params?.sourceMapId != null) qs.set('sourceMapId', String(params.sourceMapId));
        const query = qs.toString();
        return apiFetch<ImportLibraryResponse>(
            `/graph-edit-maps/${id}/import-library${query ? `?${query}` : ''}`,
        );
    },

    saveGraph: (id: number, payload: BulkSavePayload) =>
        apiFetch<EditorGraphResponse>(`/graph-edit-maps/${id}/graph`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),

    validate: (id: number, graph: ValidateGraphPayload) =>
        apiFetch<GraphValidationResult>(`/graph-edit-maps/${id}/validate`, {
            method: 'POST',
            body: JSON.stringify(graph),
        }),

    publish: (id: number) =>
        apiFetch<GraphEditMap>(`/graph-edit-maps/${id}/publish`, { method: 'PATCH' }),

    remove: (id: number) =>
        apiFetch<void>(`/graph-edit-maps/${id}`, { method: 'DELETE' }),

    exportJson: (id: number) =>
        apiFetch<MapJsonExport>(`/graph-edit-maps/${id}/export`),

    importJson: (id: number, payload: MapJsonImportPayload) =>
        apiFetch<MapJsonImportResult>(`/graph-edit-maps/${id}/import-json`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    listRevisions: (id: number) =>
        apiFetch<MapRevision[]>(`/graph-edit-maps/${id}/revisions`),

    createRevision: (id: number, comment?: string) =>
        apiFetch<MapRevision>(`/graph-edit-maps/${id}/revisions`, {
            method: 'POST',
            body: JSON.stringify({ comment: comment?.trim() || undefined }),
        }),

    restoreRevision: (id: number, revisionId: number) =>
        apiFetch<EditorGraphResponse>(
            `/graph-edit-maps/${id}/revisions/${revisionId}/restore`,
            { method: 'POST' },
        ),
};
