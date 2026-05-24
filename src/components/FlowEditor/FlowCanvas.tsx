import {
    useCallback,
    useEffect,
    useImperativeHandle,
    forwardRef,
    useRef,
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
    type Connection,
    type Node,
    type Edge,
    type ReactFlowInstance,
    BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flowEditor.css';
import KnowledgeNode from './KnowledgeNode';
import { applyDagreLayout, editorGraphToFlow, type KnowledgeNodeData } from './layoutUtils';
import type { EditorGraphResponse } from '../../api/knowledgeMaps';

const nodeTypes = { knowledge: KnowledgeNode };

export interface FlowCanvasHandle {
    getNodes: () => Node[];
    getEdges: () => Edge[];
    focusNode: (dbId: number) => void;
    autoLayout: () => void;
}

interface FlowCanvasProps {
    graph: EditorGraphResponse | null;
    readOnly?: boolean;
    onSelectionChange?: (nodeId: number | null) => void;
    onGraphDirty?: () => void;
    onNodesDelete?: (nodes: Node[]) => void;
    onEdgesDelete?: (edges: Edge[]) => void;
}

const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(function FlowCanvas(
    { graph, readOnly = false, onSelectionChange, onGraphDirty, onNodesDelete, onEdgesDelete },
    ref,
) {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const rfInstance = useRef<ReactFlowInstance | null>(null);

    useEffect(() => {
        if (!graph) return;
        const { nodes: n, edges: e } = editorGraphToFlow(graph);
        setNodes(n);
        setEdges(e);
        setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 50);
    }, [graph, setNodes, setEdges]);

    useImperativeHandle(ref, () => ({
        getNodes: () => nodes,
        getEdges: () => edges,
        focusNode: (dbId: number) => {
            const id = String(dbId);
            rfInstance.current?.setCenter(
                nodes.find((n) => n.id === id)?.position.x ?? 0,
                nodes.find((n) => n.id === id)?.position.y ?? 0,
                { zoom: 1.2, duration: 500 },
            );
            setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
        },
        autoLayout: () => {
            setNodes((nds) => applyDagreLayout(nds, edges));
            onGraphDirty?.();
            setTimeout(() => rfInstance.current?.fitView({ padding: 0.15, duration: 400 }), 50);
        },
    }), [nodes, edges, setNodes, onGraphDirty]);

    const onConnect = useCallback(
        (connection: Connection) => {
            if (readOnly) return;
            setEdges((eds) => {
                const next = addEdge(
                    {
                        ...connection,
                        type: 'smoothstep',
                        style: { stroke: '#818cf8', strokeWidth: 2 },
                        data: { edgeType: 'prerequisite' },
                    },
                    eds,
                );
                return next;
            });
            onGraphDirty?.();
        },
        [readOnly, setEdges, onGraphDirty],
    );

    const onNodeDragStop = useCallback(() => {
        onGraphDirty?.();
    }, [onGraphDirty]);

    const onSelectionChangeHandler = useCallback(
        ({ nodes: selected }: { nodes: Node[] }) => {
            const id = selected[0]?.id;
            onSelectionChange?.(id ? Number(id) : null);
        },
        [onSelectionChange],
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
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={readOnly ? undefined : onNodesChange}
                onEdgesChange={readOnly ? undefined : onEdgesChange}
                onConnect={onConnect}
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
                    <Panel position="top-right" className="text-[10px] opacity-40 m-2">
                        React Flow · drag · connect handles · Del
                    </Panel>
                )}
            </ReactFlow>
        </div>
    );
});

export default FlowCanvas;
