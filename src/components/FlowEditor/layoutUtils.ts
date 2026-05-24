import dagre from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { EditorGraphResponse } from '../../api/knowledgeMaps';

export type KnowledgeNodeData = {
    label: string;
    topicId: number | null;
    color: string;
    dbId: number;
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 52;

export function applyDagreLayout(nodes: Node[], edges: Edge[], direction = 'LR'): Node[] {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: direction, nodesep: 70, ranksep: 110, marginx: 40, marginy: 40 });

    nodes.forEach((node) => {
        g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });
    edges.forEach((edge) => {
        g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    return nodes.map((node) => {
        const pos = g.node(node.id);
        return {
            ...node,
            position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
        };
    });
}

export function editorGraphToFlow(graph: EditorGraphResponse): { nodes: Node[]; edges: Edge[] } {
    const edges: Edge[] = graph.edges.map((e) => ({
        id: `e-${e.id}`,
        source: String(e.fromNodeId),
        target: String(e.toNodeId),
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#818cf8', width: 18, height: 18 },
        style: { stroke: '#818cf8', strokeWidth: 2 },
        data: { dbId: e.id, edgeType: e.type },
    }));

    let nodes: Node[] = graph.nodes.map((n) => ({
        id: String(n.id),
        type: 'knowledge',
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        data: {
            label: n.title,
            topicId: n.topicId,
            color: n.color ?? '#6366f1',
            dbId: n.id,
        } satisfies KnowledgeNodeData,
    }));

    const needsLayout = graph.nodes.some((n) => n.x == null || n.y == null);
    if (needsLayout && nodes.length > 0) {
        nodes = applyDagreLayout(nodes, edges);
    }

    return { nodes, edges };
}

export function flowToBulkSave(
    nodes: Node[],
    edges: Edge[],
    deletedNodeIds: number[],
    deletedEdgeIds: number[],
) {
    return {
        nodes: nodes.map((n) => ({
            id: (n.data as KnowledgeNodeData).dbId,
            title: (n.data as KnowledgeNodeData).label,
            topicId: (n.data as KnowledgeNodeData).topicId,
            x: Math.round(n.position.x),
            y: Math.round(n.position.y),
            color: (n.data as KnowledgeNodeData).color,
        })),
        edges: edges.map((e) => ({
            id: e.data?.dbId as number | undefined,
            fromNodeId: Number(e.source),
            toNodeId: Number(e.target),
            type: (e.data?.edgeType as string | null) ?? 'prerequisite',
        })),
        deletedNodeIds,
        deletedEdgeIds,
        createRevision: true,
    };
}

export { NODE_WIDTH, NODE_HEIGHT };
