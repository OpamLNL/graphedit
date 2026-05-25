import { apiFetch } from './client';

export interface KnowledgeMap {
    id: number;
    title: string;
    description: string | null;
    ownerUid: string | null;
    status: 'draft' | 'published';
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

export interface GraphValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
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
    groupEdges?: {
        id?: number;
        fromGroupId: string;
        toGroupId: string;
        type?: string | null;
    }[];
    deletedNodeIds?: number[];
    deletedEdgeIds?: number[];
    deletedGroupEdgeIds?: number[];
    groupLayouts?: {
        groupId: string;
        x: number;
        y: number;
    }[];
    createRevision?: boolean;
    revisionComment?: string;
}

export const knowledgeMapsApi = {
    list: () => apiFetch<KnowledgeMap[]>('/knowledge-maps'),

    getOne: (id: number) => apiFetch<KnowledgeMap>(`/knowledge-maps/${id}`),

    create: (body: { title: string; description?: string }) =>
        apiFetch<KnowledgeMap>('/knowledge-maps', {
            method: 'POST',
            body: JSON.stringify(body),
        }),

    getEditorGraph: (id: number) =>
        apiFetch<EditorGraphResponse>(`/knowledge-maps/${id}/graph`),

    saveGraph: (id: number, payload: BulkSavePayload) =>
        apiFetch<EditorGraphResponse>(`/knowledge-maps/${id}/graph`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),

    validate: (id: number) =>
        apiFetch<GraphValidationResult>(`/knowledge-maps/${id}/validate`),

    publish: (id: number) =>
        apiFetch<KnowledgeMap>(`/knowledge-maps/${id}/publish`, { method: 'PATCH' }),

    remove: (id: number) =>
        apiFetch<void>(`/knowledge-maps/${id}`, { method: 'DELETE' }),
};
