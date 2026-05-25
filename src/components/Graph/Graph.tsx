import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildViewGraphOptions } from './graphStyles';
import GraphMapHUD from './GraphMapHUD';
import { buildFocusMoveTo } from '../../utils/graphViewport';
import { layoutNodesByLevel } from '../../utils/levelLayout';
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
    const programmaticMoveRef = useRef(false);

    const sourceRef = useRef({ nodes, edges });
    const { theme } = useTheme();

    const themeRef = useRef(theme);
    const modeRef = useRef(mode);
    const semanticZoomRef = useRef(semanticZoom);
    const onNodeClickRef = useRef(onNodeClick);
    const onLevelFocusRef = useRef(onLevelFocus);
    const onZoomModeChangeRef = useRef(onZoomModeChange);
    const activeNodeIdRef = useRef<number | null>(activeNodeId ?? null);
    const prevActiveNodeIdRef = useRef<number | null>(null);

    const isLarge = nodes.length > 80;

    activeNodeIdRef.current = activeNodeId ?? null;
    sourceRef.current = { nodes, edges };
    themeRef.current = theme;
    modeRef.current = mode;
    semanticZoomRef.current = semanticZoom;
    onNodeClickRef.current = onNodeClick;
    onLevelFocusRef.current = onLevelFocus;
    onZoomModeChangeRef.current = onZoomModeChange;

    const layoutPositions = useMemo(
        () =>
            layoutNodesByLevel(nodes, {
                levelSeparation: isLarge ? 160 : 200,
                nodeSpacing: isLarge ? 44 : 52,
                normalizeColumns: true,
            }),
        [nodes, isLarge],
    );

    const layoutPositionsRef = useRef(layoutPositions);
    layoutPositionsRef.current = layoutPositions;

    const resolvedLevelRange = useMemo(
        () =>
            levelRange.length > 0
                ? levelRange
                : [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b),
        [levelRange, nodes],
    );

    const runProgrammaticMove = useCallback((callback: () => void, duration = 450) => {
        programmaticMoveRef.current = true;
        callback();

        window.setTimeout(() => {
            programmaticMoveRef.current = false;
        }, duration);
    }, []);

    const fitView = useCallback(
        (animate = true) => {
            const network = networkRef.current;
            if (!network || !nodesDS.current) return;

            const ids = nodesDS.current.getIds();

            runProgrammaticMove(() => {
                if (ids.length === 0) {
                    network.fit({
                        animation: animate
                            ? { duration: 400, easingFunction: 'easeInOutQuad' }
                            : false,
                    });
                    return;
                }

                network.fit({
                    nodes: ids,
                    animation: animate
                        ? { duration: 400, easingFunction: 'easeInOutQuad' }
                        : false,
                });
            });
        },
        [runProgrammaticMove],
    );

    const zoomBy = useCallback(
        (factor: number) => {
            const network = networkRef.current;
            if (!network) return;

            runProgrammaticMove(
                () => {
                    network.moveTo({
                        scale: Math.min(3, Math.max(0.1, network.getScale() * factor)),
                        animation: { duration: 180, easingFunction: 'easeInOutQuad' },
                    });
                },
                220,
            );
        },
        [runProgrammaticMove],
    );

    const focusNodeById = useCallback(
        (id: number, preserveScale = false) => {
            const network = networkRef.current;
            if (!network || !nodesDS.current?.get(id)) return;

            const pos = layoutPositionsRef.current.get(id);
            if (!pos) return;

            network.selectNodes([id]);

            const moveOpts = buildFocusMoveTo(
                pos,
                preserveScale ? network.getScale() : undefined,
            );

            runProgrammaticMove(() => {
                network.moveTo(moveOpts);
            });
        },
        [runProgrammaticMove],
    );

    const applyDisplay = useCallback(
        (network: Network, display: ZoomDisplayMode, animate = true) => {
            const { nodes: srcNodes, edges: srcEdges } = sourceRef.current;
            const large = srcNodes.length > 80;
            const isSuper = display === 'super' && semanticZoomRef.current && large;

            if (!nodesDS.current || !edgesDS.current) return;

            network.setOptions(
                buildViewGraphOptions(themeRef.current, modeRef.current, srcNodes.length, isSuper),
            );

            nodesDS.current.clear();
            edgesDS.current.clear();

            if (isSuper) {
                const { nodes: superNodes, edges: superEdges } = buildLevelSuperGraph(
                    srcNodes,
                    srcEdges,
                );

                nodesDS.current.add(superNodes);
                edgesDS.current.add(superEdges);
            } else {
                nodesDS.current.add(styledDetailNodes(srcNodes, large, activeNodeIdRef.current));
                edgesDS.current.add(srcEdges);
            }

            zoomModeRef.current = display;
            onZoomModeChangeRef.current?.(display);

            if (animate && display === 'super') {
                fitView();
            }
        },
        [fitView],
    );

    const focusActiveNode = useCallback(
        (preserveScale = false) => {
            const id = activeNodeIdRef.current;

            if (id == null) {
                fitView();
                return;
            }

            if (zoomModeRef.current === 'super') {
                const network = networkRef.current;
                if (!network) return;

                applyDisplay(network, 'detail', false);
                requestAnimationFrame(() => focusNodeById(id, preserveScale));
                return;
            }

            focusNodeById(id, preserveScale);
        },
        [applyDisplay, fitView, focusNodeById],
    );

    useEffect(() => {
        if (!containerRef.current) return;

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
                applyDisplay(network, 'detail', false);

                const first = sourceRef.current.nodes.find((n) => n.level === level);
                if (first) requestAnimationFrame(() => focusNodeById(first.id, false));

                return;
            }

            if (typeof clickedId === 'number') {
                onNodeClickRef.current?.(clickedId);
                focusNodeById(clickedId, false);
                localStorage.setItem('lastFocusedNodeId', clickedId.toString());
            }
        });

        network.on('zoom', () => {
            if (programmaticMoveRef.current) return;
            if (!semanticZoomRef.current || sourceRef.current.nodes.length <= 80) return;

            if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);

            zoomTimerRef.current = setTimeout(() => {
                if (programmaticMoveRef.current) return;

                const scale = network.getScale();
                const next = resolveZoomMode(scale, zoomModeRef.current);

                if (next !== zoomModeRef.current) {
                    applyDisplay(network, next, false);
                }
            }, 120);
        });

        window.__focusGraphNode = (id: number) => {
            activeNodeIdRef.current = id;

            if (zoomModeRef.current === 'super') {
                applyDisplay(network, 'detail', false);
                requestAnimationFrame(() => focusNodeById(id, false));
            } else {
                focusNodeById(id, false);
            }
        };

        window.__fitGraphView = () => fitView();

        network.once('afterDrawing', () => {
            if (activeNodeIdRef.current != null && nodesDS.current?.get(activeNodeIdRef.current)) {
                focusNodeById(activeNodeIdRef.current, false);
            } else {
                fitView(false);
            }
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
    }, [
        nodes,
        edges,
        theme,
        mode,
        semanticZoom,
        isLarge,
        applyDisplay,
        focusNodeById,
        fitView,
    ]);

    useEffect(() => {
        if (activeNodeId == null) return;
        if (!sourceRef.current.nodes.some((n) => n.id === activeNodeId)) return;

        if (networkRef.current && zoomModeRef.current === 'detail' && nodesDS.current) {
            patchActiveNodeHighlight(
                nodesDS.current,
                sourceRef.current.nodes,
                activeNodeId,
                prevActiveNodeIdRef.current,
                isLarge,
            );

            prevActiveNodeIdRef.current = activeNodeId;
        }

        focusActiveNode(false);
    }, [activeNodeId, focusActiveNode, isLarge]);

    useEffect(() => {
        const el = shellRef.current;
        if (!el) return;

        const ro = new ResizeObserver(() => networkRef.current?.redraw());
        ro.observe(el);

        return () => ro.disconnect();
    }, []);

    return (
        <div ref={shellRef} className="absolute inset-0 graph-map-shell overflow-hidden rounded-lg">
            <div ref={containerRef} className="absolute inset-0 z-0" />

            <GraphMapHUD
                selectedLevel={selectedLevel}
                levelRange={resolvedLevelRange}
                activeNodeTitle={activeNodeTitle}
                onFit={() => fitView()}
                onRecenter={() => focusActiveNode(true)}
                onZoomIn={() => zoomBy(1.2)}
                onZoomOut={() => zoomBy(1 / 1.2)}
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