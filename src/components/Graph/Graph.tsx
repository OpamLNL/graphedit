import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildViewGraphOptions } from './graphStyles';
import GraphMapHUD from './GraphMapHUD';
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
    activeNodeTitle?: string | null;
    selectedLevel?: number | null;
    levelRange?: number[];
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
    activeNodeTitle = null,
    selectedLevel = null,
    levelRange = [],
    mode = 'view',
    semanticZoom = false,
    onZoomModeChange,
    onLevelFocus,
}: GraphProps) {
    const shellRef = useRef<HTMLDivElement | null>(null);
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
    const focusTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const mountedRef = useRef(true);

    const clearFocusTimers = useCallback(() => {
        for (const timer of focusTimersRef.current) clearTimeout(timer);
        focusTimersRef.current = [];
    }, []);

    const scheduleFocusAttempt = useCallback((fn: () => void, delay: number) => {
        const timer = setTimeout(() => {
            if (!mountedRef.current || !networkRef.current) return;
            fn();
        }, delay);
        focusTimersRef.current.push(timer);
    }, []);

    const fitView = useCallback((animate = true) => {
        const network = networkRef.current;
        if (!network) return;
        network.fit({
            padding: 48,
            animation: animate
                ? { duration: 450, easingFunction: 'easeInOutQuad' }
                : false,
        });
    }, []);

    const zoomBy = useCallback((factor: number) => {
        const network = networkRef.current;
        if (!network) return;
        const scale = network.getScale() * factor;
        network.moveTo({
            scale: Math.min(4, Math.max(0.08, scale)),
            animation: { duration: 200, easingFunction: 'easeInOutQuad' },
        });
    }, []);

    activeNodeIdRef.current = activeNodeId ?? null;

    const resolvedLevelRange = useMemo(
        () =>
            levelRange.length > 0
                ? levelRange
                : [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b),
        [levelRange, nodes],
    );

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
            fitView();
        }
    }, [fitView]);

    const focusNodeById = useCallback(
        (id: number) => {
            const network = networkRef.current;
            if (!network || !nodesDS.current?.get(id)) return;

            const isLarge = sourceRef.current.nodes.length > 80;
            const targetScale = isLarge ? 1.35 : 1.15;
            const animation = { duration: 600, easingFunction: 'easeInOutQuad' as const };

            let settled = false;

            const centerOnNode = (): boolean => {
                const net = networkRef.current;
                if (settled || !net || !nodesDS.current?.get(id)) return settled;

                const positions = net.getPositions([id]);
                const pos = positions[id];
                if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false;

                settled = true;
                net.selectNodes([id]);
                net.moveTo({
                    position: { x: pos.x, y: pos.y },
                    scale: targetScale,
                    offset: { x: 0, y: 0 },
                    animation,
                });
                return true;
            };

            if (centerOnNode()) return;

            const onLayoutDone = () => {
                if (!networkRef.current) return;
                centerOnNode();
                networkRef.current.off('stabilizationIterationsDone', onLayoutDone);
                networkRef.current.off('stabilized', onLayoutDone);
            };
            network.on('stabilizationIterationsDone', onLayoutDone);
            network.on('stabilized', onLayoutDone);

            let drawAttempts = 0;
            const onAfterDraw = () => {
                if (!networkRef.current) return;
                if (centerOnNode() || ++drawAttempts >= 12) {
                    networkRef.current.off('afterDrawing', onAfterDraw);
                }
            };
            network.on('afterDrawing', onAfterDraw);

            for (const delay of [50, 150, 350, 700, 1200, 2000]) {
                scheduleFocusAttempt(centerOnNode, delay);
            }
        },
        [scheduleFocusAttempt],
    );

    const ensureDetailAndFocus = useCallback(
        (id: number) => {
            const network = networkRef.current;
            if (!network) return;

            clearFocusTimers();

            const runFocus = () => {
                if (!networkRef.current || !nodesDS.current?.get(id)) return;
                focusNodeById(id);
            };

            if (zoomModeRef.current === 'super') {
                applyDisplay(network, 'detail', false);
                network.once('stabilized', runFocus);
                network.once('stabilizationIterationsDone', runFocus);
                for (const delay of [80, 250, 600, 1200]) {
                    scheduleFocusAttempt(runFocus, delay);
                }
            } else {
                runFocus();
            }
        },
        [applyDisplay, focusNodeById, clearFocusTimers, scheduleFocusAttempt],
    );

    // Ініціалізація мережі — лише коли змінюються дані/тема/режим
    useEffect(() => {
        mountedRef.current = true;
        if (!containerRef.current) return;

        clearFocusTimers();

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
                    if (first) focusNodeById(first.id);
                }, 150);
                return;
            }

            if (typeof clickedId === 'number') {
                onNodeClickRef.current?.(clickedId);
                focusNodeById(clickedId);
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

        window.__fitGraphView = () => fitView();

        requestAnimationFrame(() => {
            const pendingId = activeNodeIdRef.current;
            if (pendingId != null && nodesDS.current?.get(pendingId)) {
                focusNodeById(pendingId);
            } else {
                fitView(false);
            }
        });

        return () => {
            mountedRef.current = false;
            clearFocusTimers();
            if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
            window.__focusGraphNode = undefined;
            window.__fitGraphView = undefined;
            network.destroy();
            networkRef.current = null;
            nodesDS.current = null;
            edgesDS.current = null;
        };
    }, [nodes, edges, theme, mode, semanticZoom, applyDisplay, focusNodeById, clearFocusTimers, fitView]);

    // Підсвітка обраного вузла + фокус
    useEffect(() => {
        if (activeNodeId == null) return;
        if (!sourceRef.current.nodes.some((n) => n.id === activeNodeId)) return;

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

    // Після зміни розміру контейнера — перерахувати viewport
    useEffect(() => {
        const el = shellRef.current;
        if (!el) return;

        let timer: ReturnType<typeof setTimeout> | null = null;
        const ro = new ResizeObserver(() => {
            const network = networkRef.current;
            if (!network) return;

            network.redraw();
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                const id = activeNodeIdRef.current;
                if (id != null && nodesDS.current?.get(id)) {
                    focusNodeById(id);
                } else {
                    fitView(false);
                }
            }, 100);
        });
        ro.observe(el);
        return () => {
            ro.disconnect();
            if (timer) clearTimeout(timer);
        };
    }, [focusNodeById, fitView]);

    const handleRecenter = useCallback(() => {
        const id = activeNodeIdRef.current;
        if (id != null) focusNodeById(id);
        else fitView();
    }, [focusNodeById, fitView]);

    return (
        <div ref={shellRef} className="absolute inset-0 graph-map-shell overflow-hidden rounded-lg">
            <div ref={containerRef} className="absolute inset-0 z-0" />
            <GraphMapHUD
                selectedLevel={selectedLevel}
                levelRange={resolvedLevelRange}
                activeNodeTitle={activeNodeTitle}
                onFit={() => fitView()}
                onRecenter={handleRecenter}
                onZoomIn={() => zoomBy(1.25)}
                onZoomOut={() => zoomBy(0.8)}
            />
        </div>
    );
}

declare global {
    interface Window {
        __focusGraphNode?: (id: number) => void;
        __fitGraphView?: () => void;
    }
}
