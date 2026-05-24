import { useCallback, useEffect, useRef } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildViewGraphOptions } from './graphStyles';
import {
    buildLevelSuperGraph,
    isSuperNodeId,
    levelFromSuperId,
    patchActiveNodeHighlight,
    resolveZoomMode,
    styledDetailNodes,
    type ZoomDisplayMode,
} from '../../utils/semanticZoom';

export interface NodeData {
    id: number;
    label: string;
    title: string;
    topicId: number;
    x: number | null;
    y: number | null;
    level: number;
    progress: number;
    status: 'completed' | 'available' | 'locked';
}

export interface EdgeData {
    from: number;
    to: number;
}

interface GraphProps {
    nodes: NodeData[];
    edges: EdgeData[];
    onNodeClick?: (nodeId: number) => void;
    activeNodeId?: number | null;
    mode?: 'view' | 'edit';
    semanticZoom?: boolean;
    onZoomModeChange?: (mode: ZoomDisplayMode) => void;
    onLevelFocus?: (level: number) => void;
}

export default function Graph({
    nodes,
    edges,
    onNodeClick,
    activeNodeId,
    mode = 'view',
    semanticZoom = false,
    onZoomModeChange,
    onLevelFocus,
}: GraphProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const networkRef = useRef<Network | null>(null);
    const nodesDS = useRef<DataSet<{ id: number | string }> | null>(null);
    const edgesDS = useRef<DataSet<{ from: number | string; to: number | string }> | null>(null);
    const zoomModeRef = useRef<ZoomDisplayMode>('detail');
    const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sourceRef = useRef({ nodes, edges });
    const { theme } = useTheme();

    const themeRef = useRef(theme);
    const modeRef = useRef(mode);
    const semanticZoomRef = useRef(semanticZoom);
    const onNodeClickRef = useRef(onNodeClick);
    const onLevelFocusRef = useRef(onLevelFocus);
    const onZoomModeChangeRef = useRef(onZoomModeChange);
    const activeNodeIdRef = useRef(activeNodeId);
    const prevActiveNodeIdRef = useRef<number | null>(null);

    activeNodeIdRef.current = activeNodeId ?? null;

    sourceRef.current = { nodes, edges };
    themeRef.current = theme;
    modeRef.current = mode;
    semanticZoomRef.current = semanticZoom;
    onNodeClickRef.current = onNodeClick;
    onLevelFocusRef.current = onLevelFocus;
    onZoomModeChangeRef.current = onZoomModeChange;

    const applyDisplay = useCallback((network: Network, display: ZoomDisplayMode, animate = true) => {
        const { nodes: srcNodes, edges: srcEdges } = sourceRef.current;
        const isLarge = srcNodes.length > 80;
        const isSuper = display === 'super' && semanticZoomRef.current && isLarge;

        if (!nodesDS.current || !edgesDS.current) return;

        network.setOptions(
            buildViewGraphOptions(themeRef.current, modeRef.current, srcNodes.length, isSuper),
        );

        if (isSuper) {
            const { nodes: superNodes, edges: superEdges } = buildLevelSuperGraph(srcNodes, srcEdges);
            nodesDS.current.clear();
            edgesDS.current.clear();
            nodesDS.current.add(superNodes);
            edgesDS.current.add(superEdges);
        } else {
            nodesDS.current.clear();
            edgesDS.current.clear();
            nodesDS.current.add(styledDetailNodes(srcNodes, isLarge, activeNodeIdRef.current));
            edgesDS.current.add(srcEdges);
        }

        zoomModeRef.current = display;
        onZoomModeChangeRef.current?.(display);

        if (animate) {
            network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
        }
    }, []);

    const focusNodeById = useCallback((network: Network, id: number) => {
        if (!nodesDS.current?.get(id)) return;

        const isLarge = sourceRef.current.nodes.length > 80;
        const targetScale = isLarge ? 1.6 : 1.15;
        const animation = { duration: 600, easingFunction: 'easeInOutQuad' as const };

        const centerOnNode = () => {
            if (!nodesDS.current?.get(id)) return false;

            network.selectNodes([id]);
            const positions = network.getPositions([id]);
            const pos = positions[id];

            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                network.moveTo({
                    position: { x: pos.x, y: pos.y },
                    scale: targetScale,
                    animation,
                });
            } else {
                network.focus(id, { scale: targetScale, animation });
            }
            return true;
        };

        if (centerOnNode()) return;

        const onLayoutDone = () => {
            centerOnNode();
            network.off('stabilizationIterationsDone', onLayoutDone);
            network.off('stabilized', onLayoutDone);
        };
        network.on('stabilizationIterationsDone', onLayoutDone);
        network.on('stabilized', onLayoutDone);

        setTimeout(centerOnNode, 200);
        setTimeout(centerOnNode, 600);
    }, []);

    const ensureDetailAndFocus = useCallback(
        (id: number) => {
            const network = networkRef.current;
            if (!network) return;

            if (zoomModeRef.current === 'super') {
                applyDisplay(network, 'detail', false);
                setTimeout(() => focusNodeById(network, id), 80);
                setTimeout(() => focusNodeById(network, id), 400);
            } else {
                focusNodeById(network, id);
            }
        },
        [applyDisplay, focusNodeById],
    );

    // Ініціалізація мережі — лише коли змінюються дані/тема/режим
    useEffect(() => {
        if (!containerRef.current) return;

        const isLarge = nodes.length > 80;
        const startSuper = semanticZoom && isLarge;

        const superGraph = startSuper ? buildLevelSuperGraph(nodes, edges) : null;
        const initialNodes = startSuper
            ? superGraph!.nodes
            : styledDetailNodes(nodes, isLarge, activeNodeIdRef.current);
        const initialEdges = startSuper ? superGraph!.edges : edges;

        nodesDS.current = new DataSet(initialNodes);
        edgesDS.current = new DataSet(initialEdges);
        zoomModeRef.current = startSuper ? 'super' : 'detail';

        if (networkRef.current) {
            networkRef.current.destroy();
            networkRef.current = null;
        }

        const network = new Network(
            containerRef.current,
            { nodes: nodesDS.current, edges: edgesDS.current },
            buildViewGraphOptions(theme, mode, nodes.length, startSuper),
        );
        networkRef.current = network;

        onZoomModeChangeRef.current?.(zoomModeRef.current);

        network.on('click', (params) => {
            if (params.nodes.length === 0) return;
            const clickedId = params.nodes[0];

            if (isSuperNodeId(clickedId)) {
                const level = levelFromSuperId(String(clickedId));
                onLevelFocusRef.current?.(level);
                applyDisplay(network, 'detail');
                network.moveTo({
                    scale: 0.75,
                    animation: { duration: 500, easingFunction: 'easeInOutQuad' },
                });
                setTimeout(() => {
                    const first = sourceRef.current.nodes.find((n) => n.level === level);
                    if (first) focusNodeById(network, first.id);
                }, 150);
                return;
            }

            if (typeof clickedId === 'number') {
                onNodeClickRef.current?.(clickedId);
                focusNodeById(network, clickedId);
                localStorage.setItem('lastFocusedNodeId', clickedId.toString());
            }
        });

        network.on('zoom', () => {
            if (!semanticZoomRef.current || sourceRef.current.nodes.length <= 80) return;

            if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
            zoomTimerRef.current = setTimeout(() => {
                const scale = network.getScale();
                const next = resolveZoomMode(scale, zoomModeRef.current);
                if (next !== zoomModeRef.current) {
                    applyDisplay(network, next);
                }
            }, 120);
        });

        window.__focusGraphNode = (id: number) => ensureDetailAndFocus(id);

        window.__fitGraphView = () => {
            networkRef.current?.fit({
                animation: { duration: 600, easingFunction: 'easeInOutQuad' },
            });
        };

        network.once('stabilized', () => {
            network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
        });

        return () => {
            if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
            window.__focusGraphNode = undefined;
            window.__fitGraphView = undefined;
            network.destroy();
            networkRef.current = null;
            nodesDS.current = null;
            edgesDS.current = null;
        };
    }, [nodes, edges, theme, mode, semanticZoom, applyDisplay, focusNodeById]);

    // Підсвітка обраного вузла + фокус
    useEffect(() => {
        if (activeNodeId == null) return;

        const network = networkRef.current;
        if (network && zoomModeRef.current === 'detail' && nodesDS.current) {
            const isLarge = sourceRef.current.nodes.length > 80;
            patchActiveNodeHighlight(
                nodesDS.current,
                sourceRef.current.nodes,
                activeNodeId,
                prevActiveNodeIdRef.current,
                isLarge,
            );
            prevActiveNodeIdRef.current = activeNodeId;
        }

        ensureDetailAndFocus(activeNodeId);
    }, [activeNodeId, ensureDetailAndFocus]);

    return (
        <div ref={containerRef} className="w-full h-full min-h-[500px] bg-base-200/20 rounded-lg" />
    );
}

declare global {
    interface Window {
        __focusGraphNode?: (id: number) => void;
        __fitGraphView?: () => void;
    }
}
