import dagre from '@dagrejs/dagre';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { EditorGraphResponse } from '../../api/knowledgeMaps';
import type { Topic } from '../../api/topics';
import type {
    GraphPayload,
    NodeData,
    EdgeData,
    GroupData,
    GroupEdgeData,
} from '../Graph/Graph';
import { deriveGroupsFromNodes, deriveGroupEdgesFromNodes } from '../../utils/groupGraph';
import { layoutTopicGraphByEdges } from '../../utils/graphLayout';

export type KnowledgeNodeData = {
    label: string;
    topicId: number | null;
    color: string;
    dbId: number;
    groupId?: string | null;
    isConnectSource?: boolean;
};

let tempIdCounter = -1;

export function allocateTempNodeId(): number {
    tempIdCounter -= 1;
    return tempIdCounter;
}

export function resetTempNodeIds(): void {
    tempIdCounter = -1;
}

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

export function editorGraphToFlow(
    graph: EditorGraphResponse,
    topicById?: Map<number, Topic>,
): { nodes: Node[]; edges: Edge[] } {
    const edges: Edge[] = graph.edges.map((e) => ({
        id: `e-${e.id}`,
        source: String(e.fromNodeId),
        target: String(e.toNodeId),
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#818cf8', width: 18, height: 18 },
        style: { stroke: '#818cf8', strokeWidth: 2 },
        data: { dbId: e.id, edgeType: e.type },
    }));

    let nodes: Node[] = graph.nodes.map((n) => {
        const topic = n.topicId != null ? topicById?.get(n.topicId) : undefined;
        return {
            id: String(n.id),
            type: 'knowledge',
            position: { x: n.x ?? 0, y: n.y ?? 0 },
            data: {
                label: n.title,
                topicId: n.topicId,
                color: n.color ?? '#6366f1',
                dbId: n.id,
                groupId: topic?.groupId ?? null,
            } satisfies KnowledgeNodeData,
        };
    });

    const needsLayout = graph.nodes.some((n) => n.x == null || n.y == null);
    if (needsLayout && nodes.length > 0) {
        nodes = applyDagreLayout(nodes, edges);
    }

    return { nodes, edges };
}

export function buildGraphPayloadForEditor(
    nodes: Node[],
    edges: Edge[],
    groups: GroupData[],
    groupEdges: GroupEdgeData[],
    topicById?: Map<number, Topic>,
): GraphPayload {
    const nodeData: NodeData[] = nodes.map((n) => {
        const d = n.data as KnowledgeNodeData;
        const topic = d.topicId != null ? topicById?.get(d.topicId) : undefined;
        return {
            id: d.dbId,
            label: d.label,
            title: d.label,
            topicId: d.topicId ?? 0,
            x: Math.round(n.position.x),
            y: Math.round(n.position.y),
            level: topic?.globalOrder ?? 0,
            groupId: d.groupId ?? topic?.groupId ?? null,
            orderInGroup: topic?.orderInGroup ?? 0,
            globalOrder: topic?.globalOrder ?? null,
            progress: 0,
            status: 'available' as const,
        };
    });

    const edgeData: EdgeData[] = edges.map((e) => ({
        from: Number(e.source),
        to: Number(e.target),
    }));

    let resolvedGroups = groups;
    let resolvedGroupEdges = groupEdges;
    if (resolvedGroups.length === 0 && nodeData.some((nd) => nd.groupId)) {
        resolvedGroups = deriveGroupsFromNodes(nodeData);
        resolvedGroupEdges = deriveGroupEdgesFromNodes(nodeData, edgeData);
    }

    return {
        nodes: nodeData,
        edges: edgeData,
        groups: resolvedGroups,
        groupEdges: resolvedGroupEdges,
    };
}

export function filterFlowByGroup(
    nodes: Node[],
    edges: Edge[],
    groupId: string | null,
): { nodes: Node[]; edges: Edge[] } {
    if (!groupId) return { nodes, edges };

    const visibleIds = new Set(
        nodes
            .filter((n) => (n.data as KnowledgeNodeData).groupId === groupId)
            .map((n) => n.id),
    );

    return {
        nodes: nodes.map((n) => ({
            ...n,
            hidden: !visibleIds.has(n.id),
        })),
        edges: edges.map((e) => ({
            ...e,
            hidden: !visibleIds.has(e.source) || !visibleIds.has(e.target),
        })),
    };
}

export function flowToBulkSave(
    nodes: Node[],
    edges: Edge[],
    deletedNodeIds: number[],
    deletedEdgeIds: number[],
) {
    return {
        nodes: nodes.map((n) => {
            const d = n.data as KnowledgeNodeData;
            const payload: {
                id?: number;
                title: string;
                topicId: number | null;
                x: number;
                y: number;
                color: string;
            } = {
                title: d.label.trim() || 'Новий вузол',
                topicId: d.topicId,
                x: Math.round(n.position.x),
                y: Math.round(n.position.y),
                color: d.color,
            };
            if (d.dbId > 0) payload.id = d.dbId;
            else if (d.dbId < 0) payload.id = d.dbId;
            return payload;
        }),
        edges: edges.map((e) => {
            const dbId = e.data?.dbId as number | undefined;
            return {
                id: dbId && dbId > 0 ? dbId : undefined,
                fromNodeId: Number(e.source),
                toNodeId: Number(e.target),
                type: (e.data?.edgeType as string | null) ?? 'prerequisite',
            };
        }),
        deletedNodeIds: deletedNodeIds.filter((id) => id > 0),
        deletedEdgeIds: deletedEdgeIds.filter((id) => id > 0),
        createRevision: false,
    };
}

export { NODE_WIDTH, NODE_HEIGHT };

export type EditorNodeState = {
    id: number;
    title: string;
    topicId: number | null;
    x: number | null;
    y: number | null;
    color: string;
    groupId: string | null;
};

export type EditorEdgeState = {
    id: number;
    fromNodeId: number;
    toNodeId: number;
    type: string;
};

export type EditorState = {
    nodes: EditorNodeState[];
    edges: EditorEdgeState[];
};

export type GroupEdgeState = {
    id: number;
    from: string;
    to: string;
    type: string;
};

let tempEdgeCounter = -1;

export function allocateTempEdgeId(): number {
    tempEdgeCounter -= 1;
    return tempEdgeCounter;
}

export function resetTempEdgeIds(): void {
    tempEdgeCounter = -1;
}

export function initEditorState(
    graph: EditorGraphResponse,
    topicById: Map<number, Topic>,
): EditorState {
    resetTempNodeIds();
    resetTempEdgeIds();
    return {
        nodes: graph.nodes.map((n) => ({
            id: n.id,
            title: n.title,
            topicId: n.topicId,
            x: n.x,
            y: n.y,
            color: n.color ?? '#6366f1',
            groupId:
                n.topicId != null ? (topicById.get(n.topicId)?.groupId ?? null) : null,
        })),
        edges: graph.edges.map((e) => ({
            id: e.id,
            fromNodeId: e.fromNodeId,
            toNodeId: e.toNodeId,
            type: e.type ?? 'prerequisite',
        })),
    };
}

export function editorStateToGraphPayload(
    state: EditorState,
    groups: GroupData[],
    groupEdges: GroupEdgeState[],
    topicById: Map<number, Topic>,
): GraphPayload {
    const nodeData: NodeData[] = state.nodes.map((n) => {
        const topic = n.topicId != null ? topicById.get(n.topicId) : undefined;
        return {
            id: n.id,
            label: n.title,
            title: n.title,
            topicId: n.topicId ?? 0,
            x: n.x,
            y: n.y,
            level: topic?.globalOrder ?? 0,
            groupId: n.groupId ?? topic?.groupId ?? null,
            orderInGroup: topic?.orderInGroup ?? 0,
            globalOrder: topic?.globalOrder ?? null,
            progress: 0,
            status: 'available' as const,
        };
    });

    const edgeData: EdgeData[] = state.edges.map((e) => ({
        from: e.fromNodeId,
        to: e.toNodeId,
    }));

    let resolvedGroups = groups;
    let resolvedGroupEdges = groupEdges;
    if (resolvedGroups.length === 0 && nodeData.some((nd) => nd.groupId)) {
        resolvedGroups = deriveGroupsFromNodes(nodeData);
        resolvedGroupEdges = deriveGroupEdgesFromNodes(nodeData, edgeData);
    }

    return {
        nodes: nodeData,
        edges: edgeData,
        groups: resolvedGroups,
        groupEdges: resolvedGroupEdges.map((e) => {
            const stored = groupEdges.find(
                (ge) => ge.from === e.from && ge.to === e.to,
            );
            return stored?.id != null ? { ...e, id: stored.id } : e;
        }),
    };
}

export function editorStateToBulkSave(
    state: EditorState,
    groupEdges: GroupEdgeState[],
    deletedNodeIds: number[],
    deletedEdgeIds: number[],
    deletedGroupEdgeIds: number[],
) {
    return {
        nodes: state.nodes.map((n) => {
            const payload: {
                id?: number;
                title: string;
                topicId: number | null;
                x: number;
                y: number;
                color: string;
            } = {
                title: n.title.trim() || 'Новий вузол',
                topicId: n.topicId,
                x: Math.round(n.x ?? 0),
                y: Math.round(n.y ?? 0),
                color: n.color,
            };
            if (n.id > 0) payload.id = n.id;
            else if (n.id < 0) payload.id = n.id;
            return payload;
        }),
        edges: state.edges.map((e) => ({
            id: e.id > 0 ? e.id : undefined,
            fromNodeId: e.fromNodeId,
            toNodeId: e.toNodeId,
            type: e.type ?? 'prerequisite',
        })),
        groupEdges: groupEdges.map((e) => ({
            id: e.id > 0 ? e.id : undefined,
            fromGroupId: e.from,
            toGroupId: e.to,
            type: e.type ?? 'prerequisite',
        })),
        deletedNodeIds: deletedNodeIds.filter((id) => id > 0),
        deletedEdgeIds: deletedEdgeIds.filter((id) => id > 0),
        deletedGroupEdgeIds: deletedGroupEdgeIds.filter((id) => id > 0),
        createRevision: false,
    };
}

export function autoLayoutEditorGroup(state: EditorState, groupId: string): EditorState {
    const groupNodes = state.nodes.filter((n) => n.groupId === groupId);
    const ids = new Set(groupNodes.map((n) => n.id));
    const groupEdges = state.edges.filter(
        (e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId),
    );

    if (groupNodes.length === 0) return state;

    const nodeIds = groupNodes.map((n) => n.id);
    const graphEdges = groupEdges.map((e) => ({
        from: e.fromNodeId,
        to: e.toNodeId,
    }));
    const sortKeys = new Map<number, number>(
        groupNodes.map((n) => [n.id, n.topicId ?? n.id]),
    );
    const posById = layoutTopicGraphByEdges(nodeIds, graphEdges, sortKeys);

    return {
        ...state,
        nodes: state.nodes.map((n) => {
            const pos = posById.get(n.id);
            if (!pos || n.groupId !== groupId) return n;
            return { ...n, x: pos.x, y: pos.y };
        }),
    };
}
