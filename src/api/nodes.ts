import { apiFetch } from './client';

export interface GraphNode {
    id: number;
    label?: string;
    title: string;
    topicId: number | null;
    x: number | null;
    y: number | null;
    level: number;
    groupId: string | null;
    orderInGroup?: number;
    globalOrder: number | null;
    progress: number;
    status: 'completed' | 'available' | 'locked';
    color?: string | null;
}

export interface GraphEdge {
    id?: number;
    from: number;
    to: number;
    label?: string;
    type?: string;
}

export interface KnowledgeGroupDto {
    id: string;
    title: string;
    description: string | null;
    level: number;
    sortOrder: number;
    topicCount: number;
    completedCount: number;
    availableCount: number;
    progressPercent: number;
    x?: number | null;
    y?: number | null;
}

export interface GroupEdgeDto {
    id: number;
    from: string;
    to: string;
    type: string;
}

export interface GraphResponse {
    mapId: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    groups: KnowledgeGroupDto[];
    groupEdges: GroupEdgeDto[];
}

export interface GroupGraphResponse {
    mapId: number;
    groups: KnowledgeGroupDto[];
    groupEdges: GroupEdgeDto[];
    groupLayout?: Record<string, { x: number; y: number }>;
}

export interface NodeMediaItem {
    id: number;
    url: string;
    caption: string | null;
    sortOrder: number;
}

export interface NodeContentResponse {
    nodeId: number;
    theoryMd: string | null;
    media: NodeMediaItem[];
}

export const nodesApi = {
    getGraph: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch<GraphResponse>(`/nodes/graph${q}`, { cache: 'no-store' });
    },

    getGroupGraph: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch<GroupGraphResponse>(`/nodes/group-graph${q}`, { cache: 'no-store' });
    },

    getAll: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch(`/nodes${q}`);
    },

    getContent: (nodeId: number) =>
        apiFetch<NodeContentResponse>(`/nodes/${nodeId}/content`, { cache: 'no-store' }),

    updateContent: (nodeId: number, theoryMd: string | null) =>
        apiFetch<NodeContentResponse>(`/nodes/${nodeId}/content`, {
            method: 'PATCH',
            body: JSON.stringify({ theoryMd }),
        }),

    uploadMedia: (nodeId: number, file: File, caption?: string) => {
        const form = new FormData();
        form.append('file', file);
        if (caption?.trim()) form.append('caption', caption.trim());
        return apiFetch<NodeContentResponse>(`/nodes/${nodeId}/media`, {
            method: 'POST',
            body: form,
        });
    },

    deleteMedia: (nodeId: number, mediaId: number) =>
        apiFetch<NodeContentResponse>(`/nodes/${nodeId}/media/${mediaId}`, {
            method: 'DELETE',
        }),
};
