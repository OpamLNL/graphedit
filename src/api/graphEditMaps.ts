import { apiFetch } from './client';

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

export const graphEditMapsApi = {
    /** Каталог: усі опубліковані карти */
    list: () => apiFetch<GraphEditMap[]>('/graph-edit-maps'),

    /** Мої карти: створені + з прогресом проходження */
    listMine: () => apiFetch<GraphEditMap[]>('/graph-edit-maps/mine'),

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
