import { apiFetch } from './client';

export interface GraphNode {
    id: number;
    label?: string;
    title: string;
    topicId: number;
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

export const nodesApi = {
    getGraph: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch<GraphResponse>(`/nodes/graph${q}`);
    },

    getGroupGraph: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch<GroupGraphResponse>(`/nodes/group-graph${q}`);
    },

    getAll: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch(`/nodes${q}`);
    },
};
