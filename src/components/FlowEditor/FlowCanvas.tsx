import {
    useCallback,
    useEffect,
    useImperativeHandle,
    forwardRef,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    useNodesState,
    useEdgesState,
    addEdge,
    MarkerType,
    type Connection,
    type Node,
    type Edge,
    type ReactFlowInstance,
    BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flowEditor.css';
import KnowledgeNode from './KnowledgeNode';
import {
    applyDagreLayout,
    allocateTempNodeId,
    editorGraphToFlow,
    resetTempNodeIds,
    type KnowledgeNodeData,
} from './layoutUtils';
import type { EditorGraphResponse } from '../../api/knowledgeMaps';
import type { Topic } from '../../api/topics';

const nodeTypes = { knowledge: KnowledgeNode };

function makeEdge(source: string, target: string): Edge {
    return {
        id: `e-new-${source}-${target}-${Date.now()}`,
        source,
        target,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#818cf8', width: 18, height: 18 },
        style: { stroke: '#818cf8', strokeWidth: 2 },
        data: { edgeType: 'prerequisite' },
    };
}

export interface FlowCanvasHandle {
    getNodes: () => Node[];
    getEdges: () => Edge[];
    focusNode: (dbId: number) => void;
    autoLayout: () => void;
    addNode: (partial?: Partial<KnowledgeNodeData>) => number;
    updateNode: (dbId: number, patch: Partial<KnowledgeNodeData>) => void;
    deleteNode: (dbId: number) => void;
    clearConnectSource: () => void;
}

interface FlowCanvasProps {
    graph: EditorGraphResponse | null;
    topicById?: Map<number, Topic>;
    filterGroupId?: string | null;
    connectMode?: boolean;
    defaultGroupId?: string | null;
    readOnly?: boolean;
    onSelectionChange?: (nodeId: number | null) => void;
    onGraphDirty?: () => void;
    onLoaded?: () => void;
    onNodesDelete?: (nodes: Node[]) => void;
    onEdgesDelete?: (edges: Edge[]) => void;
}

const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(function FlowCanvas(
    {
        graph,
        topicById,
        filterGroupId = null,
        connectMode = false,
        defaultGroupId = null,
        readOnly = false,
        onSelectionChange,
        onGraphDirty,
        onLoaded,
        onNodesDelete,
        onEdgesDelete,
    },
    ref,
) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [connectSourceId, setConnectSourceId] = useState<number | null>(null);
    const rfInstance = useRef<ReactFlowInstance | null>(null);

    const clearConnectSource = useCallback(() => {
        setConnectSourceId(null);
        setNodes((nds) =>
            nds.map((n) => ({
                ...n,
                data: { ...(n.data as KnowledgeNodeData), isConnectSource: false },
            })),
        );
    }, [setNodes]);

    useEffect(() => {
        if (!graph) return;
        resetTempNodeIds();
        const { nodes: n, edges: e } = editorGraphToFlow(graph, topicById);
        setNodes(n);
        setEdges(e);
        setConnectSourceId(null);
        setTimeout(() => {
            rfInstance.current?.fitView({ padding: 0.15, duration: 400 });
            onLoaded?.();
        }, 50);
    }, [graph, topicById, setNodes, setEdges, onLoaded]);

    useEffect(() => {
        if (!connectMode) clearConnectSource();
    }, [connectMode, clearConnectSource]);

    useEffect(() => {
        if (!filterGroupId || !rfInstance.current) return;
        const t = setTimeout(() => {
            const visible = nodes.filter(
                (n) => (n.data as KnowledgeNodeData).groupId === filterGroupId,
            );
            if (visible.length > 0) {
                rfInstance.current?.fitView({ padding: 0.12, duration: 350, nodes: visible });
            }
        }, 120);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- fit only when group changes
    }, [filterGroupId]);

    const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

    const visibleNodes = useMemo(
        () =>
            nodes.map((n) => ({
                ...n,
                hidden: Boolean(
                    filterGroupId && (n.data as KnowledgeNodeData).groupId !== filterGroupId,
                ),
            })),
        [nodes, filterGroupId],
    );

    const visibleEdges = useMemo(
        () =>
            edges.map((e) => {
                const src = nodeById.get(e.source)?.data as KnowledgeNodeData | undefined;
                const tgt = nodeById.get(e.target)?.data as KnowledgeNodeData | undefined;
                const inGroup =
                    !filterGroupId ||
                    (src?.groupId === filterGroupId && tgt?.groupId === filterGroupId);
                return { ...e, hidden: !inGroup };
            }),
        [edges, nodeById, filterGroupId],
    );

    useImperativeHandle(ref, () => ({
        getNodes: () => nodes,
        getEdges: () => edges,
        focusNode: (dbId: number) => {
            const id = String(dbId);
            const target = nodes.find((n) => n.id === id);
            if (target) {
                rfInstance.current?.setCenter(target.position.x, target.position.y, {
                    zoom: 1.2,
                    duration: 500,
                });
            }
            setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
        },
        autoLayout: () => {
            setNodes((nds) => {
                const visible = filterGroupId
                    ? nds.filter((n) => (n.data as KnowledgeNodeData).groupId === filterGroupId)
                    : nds;
                const visibleIds = new Set(visible.map((n) => n.id));
                const visibleEdges = edges.filter(
                    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
                );
                if (visible.length === 0) return nds;
                const laid = applyDagreLayout(visible, visibleEdges);
                const posMap = new Map(laid.map((n) => [n.id, n.position]));
                return nds.map((n) =>
                    posMap.has(n.id) ? { ...n, position: posMap.get(n.id)! } : n,
                );
            });
            onGraphDirty?.();
            setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 50);
        },
        addNode: (partial) => {
            const dbId = allocateTempNodeId();
            const inst = rfInstance.current;

            let position = { x: 0, y: 0 };
            if (inst) {
                const el = document.querySelector('.flow-canvas');
                const rect = el?.getBoundingClientRect();
                if (rect) {
                    position = inst.screenToFlowPosition({
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                    });
                }
            }

            const data: KnowledgeNodeData = {
                label: partial?.label ?? 'Новий вузол',
                topicId: partial?.topicId ?? null,
                color: partial?.color ?? '#6366f1',
                dbId,
                groupId: partial?.groupId ?? defaultGroupId ?? null,
            };

            setNodes((nds) => [
                ...nds.map((n) => ({ ...n, selected: false })),
                {
                    id: String(dbId),
                    type: 'knowledge',
                    position,
                    selected: true,
                    data,
                },
            ]);
            onSelectionChange?.(dbId);
            onGraphDirty?.();
            return dbId;
        },
        updateNode: (dbId, patch) => {
            const id = String(dbId);
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === id
                        ? { ...n, data: { ...(n.data as KnowledgeNodeData), ...patch } }
                        : n,
                ),
            );
            onGraphDirty?.();
        },
        deleteNode: (dbId) => {
            const id = String(dbId);
            const toRemove = nodes.filter((n) => n.id === id);
            if (toRemove.length === 0) return;
            onNodesDelete?.(toRemove);
            setNodes((nds) => nds.filter((n) => n.id !== id));
            setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
            onSelectionChange?.(null);
            onGraphDirty?.();
        },
        clearConnectSource,
    }), [
        nodes,
        edges,
        filterGroupId,
        defaultGroupId,
        setNodes,
        setEdges,
        onGraphDirty,
        onSelectionChange,
        onNodesDelete,
        clearConnectSource,
    ]);

    const connectNodes = useCallback(
        (fromDbId: number, toDbId: number) => {
            if (fromDbId === toDbId) return;
            const source = String(fromDbId);
            const target = String(toDbId);
            setEdges((eds) => {
                const duplicate = eds.some((e) => e.source === source && e.target === target);
                if (duplicate) return eds;
                return [...eds, makeEdge(source, target)];
            });
            onGraphDirty?.();
        },
        [setEdges, onGraphDirty],
    );

    const onConnect = useCallback(
        (connection: Connection) => {
            if (readOnly || connectMode) return;
            setEdges((eds) =>
                addEdge(
                    {
                        ...connection,
                        type: 'smoothstep',
                        style: { stroke: '#818cf8', strokeWidth: 2 },
                        data: { edgeType: 'prerequisite' },
                    },
                    eds,
                ),
            );
            onGraphDirty?.();
        },
        [readOnly, connectMode, setEdges, onGraphDirty],
    );

    const onNodeClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            if (readOnly || !connectMode) return;
            const dbId = (node.data as KnowledgeNodeData).dbId;

            if (connectSourceId == null) {
                setConnectSourceId(dbId);
                setNodes((nds) =>
                    nds.map((n) => ({
                        ...n,
                        selected: n.id === node.id,
                        data: {
                            ...(n.data as KnowledgeNodeData),
                            isConnectSource: n.id === node.id,
                        },
                    })),
                );
                onSelectionChange?.(dbId);
                return;
            }

            if (connectSourceId === dbId) {
                clearConnectSource();
                return;
            }

            connectNodes(connectSourceId, dbId);
            clearConnectSource();
        },
        [
            readOnly,
            connectMode,
            connectSourceId,
            connectNodes,
            clearConnectSource,
            setNodes,
            onSelectionChange,
        ],
    );

    const onPaneClick = useCallback(() => {
        if (connectMode && connectSourceId != null) {
            clearConnectSource();
        }
    }, [connectMode, connectSourceId, clearConnectSource]);

    const onNodeDragStop = useCallback(() => {
        onGraphDirty?.();
    }, [onGraphDirty]);

    const onSelectionChangeHandler = useCallback(
        ({ nodes: selected }: { nodes: Node[] }) => {
            if (connectMode) return;
            const id = selected[0]?.id;
            onSelectionChange?.(id ? Number(id) : null);
        },
        [connectMode, onSelectionChange],
    );

    const onNodesDeleteHandler = useCallback(
        (deleted: Node[]) => {
            onNodesDelete?.(deleted);
            onGraphDirty?.();
        },
        [onNodesDelete, onGraphDirty],
    );

    const onEdgesDeleteHandler = useCallback(
        (deleted: Edge[]) => {
            onEdgesDelete?.(deleted);
            onGraphDirty?.();
        },
        [onEdgesDelete, onGraphDirty],
    );

    return (
        <div className="flow-canvas w-full h-full">
            <ReactFlow
                nodes={visibleNodes}
                edges={visibleEdges}
                nodeTypes={nodeTypes}
                onNodesChange={readOnly ? undefined : onNodesChange}
                onEdgesChange={readOnly ? undefined : onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onNodeDragStop={onNodeDragStop}
                onSelectionChange={onSelectionChangeHandler}
                onNodesDelete={readOnly ? undefined : onNodesDeleteHandler}
                onEdgesDelete={readOnly ? undefined : onEdgesDeleteHandler}
                onInit={(inst) => { rfInstance.current = inst; }}
                fitView
                minZoom={0.05}
                maxZoom={2}
                deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                elementsSelectable
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(128,128,128,0.2)" />
                <Controls showInteractive={!readOnly} />
                <MiniMap
                    nodeColor={(n) => (n.data as KnowledgeNodeData)?.color ?? '#6366f1'}
                    maskColor="rgba(0,0,0,0.12)"
                    pannable
                    zoomable
                />
                {!readOnly && (
                    <Panel position="top-right" className="text-[10px] opacity-50 m-2 max-w-[200px] text-right">
                        {connectMode ? (
                            connectSourceId != null
                                ? 'Клік — кінцевий вузол · Esc — скасувати'
                                : 'Клік — початковий вузол · handles теж працюють'
                        ) : (
                            'Перетягни · handles · Del — видалити'
                        )}
                    </Panel>
                )}
            </ReactFlow>
        </div>
    );
});

export default FlowCanvas;
