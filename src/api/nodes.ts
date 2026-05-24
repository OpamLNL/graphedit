import { apiFetch } from './client';

export interface GraphNode {
    id: number;
    label?: string;
    title: string;
    topicId: number;
    x: number | null;
    y: number | null;
    level: number;
    progress: number;
    status: 'completed' | 'available' | 'locked';
    color?: string | null;
}

export interface GraphEdge {
    id?: number;
    from: number;
    to: number;
    label?: string;
}

export interface GraphResponse {
    mapId: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export const nodesApi = {
    getGraph: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch<GraphResponse>(`/nodes/graph${q}`);
    },

    getAll: (mapId?: number) => {
        const q = mapId ? `?mapId=${mapId}` : '';
        return apiFetch(`/nodes${q}`);
    },
};
