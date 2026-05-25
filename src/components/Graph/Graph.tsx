import { useCallback, useEffect, useRef } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildViewGraphOptions } from './graphStyles';
import GraphMapHUD from './GraphMapHUD';
import {
    buildFocusMoveTo,
    ensureGraphVisible,
    limitsFromFitScale,
    zoomAtDomPoint,
} from '../../utils/graphViewport';
import {
    buildGroupSuperGraph,
    filterGraphByGroup,
    groupIdFromNodeId,
    isGroupNodeId,
    layoutGroups,
    layoutTopicsInGroup,
    patchTopicHighlight,
    styledTopicNodes,
} from '../../utils/groupGraph';

export interface NodeData {
    id: number;
    label: string;
    title: string;
    topicId: number;
    x: number | null;
    y: number | null;
    level: number;
    groupId: string | null;
    orderInGroup?: number;
    globalOrder?: number | null;
    progress: number;
    status: 'completed' | 'available' | 'locked';
}

export interface EdgeData {
    from: number;
    to: number;
}

export interface GroupData {
    id: string;
    title: string;
    description: string | null;
    level: number;
    sortOrder: number;
    topicCount: number;
    completedCount: number;
    availableCount: number;
    progressPercent: number;
}

export interface GroupEdgeData {
    from: string;
    to: string;
    type: string;
}

export type GraphViewScope = 'groups' | 'topics';

export interface GraphPayload {
    nodes: NodeData[];
    edges: EdgeData[];
    groups: GroupData[];
    groupEdges: GroupEdgeData[];
}

interface GraphProps {
    payload: GraphPayload | null;
    viewScope: GraphViewScope;
    selectedGroupId: string | null;
    activeNodeId?: number | null;
    activeNodeTitle?: string | null;
    onGroupSelect?: (groupId: string) => void;
    onNodeClick?: (nodeId: number) => void;
    onBackToGroups?: () => void;
}

function getCanvasSize(container: HTMLElement | null) {
    if (!container) return { width: 900, height: 600 };
    return { width: container.clientWidth || 900, height: container.clientHeight || 600 };
}

const CLICK_SLOP_PX = 8;

function resolveGroupClickId(params: {
    nodes: (number | string)[];
    items?: { nodeId?: number | string }[];
}): string | null {
    const fromNodes = params.nodes[0];
    if (fromNodes != null && isGroupNodeId(fromNodes)) {
        return groupIdFromNodeId(String(fromNodes));
    }

    const item = params.items?.find((i) => i.nodeId != null && isGroupNodeId(i.nodeId));
    if (item?.nodeId != null) {
        return groupIdFromNodeId(String(item.nodeId));
    }

    return null;
}

function visibleNodeCount(
    data: GraphPayload,
    scope: GraphViewScope,
    groupId: string | null,
): number {
    if (scope === 'groups') return data.groups.length;
    if (!groupId) return 0;
    return data.nodes.filter((n) => n.groupId === groupId).length;
}

export default function Graph({
    payload,
    viewScope,
    selectedGroupId,
    activeNodeId = null,
    activeNodeTitle = null,
    onGroupSelect,
    onNodeClick,
    onBackToGroups,
}: GraphProps) {
    const shellRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const networkRef = useRef<Network | null>(null);
    const nodesDS = useRef<DataSet<{ id: number | string }> | null>(null);
    const edgesDS = useRef<DataSet<{ from: number | string; to: number | string }> | null>(null);

    const payloadRef = useRef(payload);
    const viewScopeRef = useRef(viewScope);
    const selectedGroupIdRef = useRef(selectedGroupId);
    const nodeLayoutRef = useRef<Map<number | string, { x: number; y: number }>>(new Map());
    const prevActiveNodeIdRef = useRef<number | null>(null);
    const activeNodeIdRef = useRef(activeNodeId);
    const programmaticMoveRef = useRef(false);
    const isDraggingViewRef = useRef(false);
    const viewKeyRef = useRef('');
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
    const handleNodePickRef = useRef<(rawId: number | string) => void>(() => {});
    const handleGroupPickRef = useRef<(groupId: string) => void>(() => {});
    const lastGroupPickAtRef = useRef(0);
    const fitScaleRef = useRef(0.85);

    const onGroupSelectRef = useRef(onGroupSelect);
    const onNodeClickRef = useRef(onNodeClick);
    const onBackToGroupsRef = useRef(onBackToGroups);

    const { theme } = useTheme();
    const themeRef = useRef(theme);

    payloadRef.current = payload;
    viewScopeRef.current = viewScope;
    selectedGroupIdRef.current = selectedGroupId;
    activeNodeIdRef.current = activeNodeId ?? null;
    themeRef.current = theme;
    onGroupSelectRef.current = onGroupSelect;
    onNodeClickRef.current = onNodeClick;
    onBackToGroupsRef.current = onBackToGroups;

    const runProgrammaticMove = useCallback((callback: () => void, duration = 400) => {
        programmaticMoveRef.current = true;
        callback();
        window.setTimeout(() => {
            programmaticMoveRef.current = false;
        }, duration);
    }, []);

    const captureFitScale = useCallback(() => {
        const network = networkRef.current;
        if (!network) return;
        const scale = network.getScale();
        if (scale > 0) fitScaleRef.current = scale;
    }, []);

    const getZoomLimits = useCallback(
        () => limitsFromFitScale(fitScaleRef.current, viewScopeRef.current),
        [],
    );

    const preferVisibleCanvasPoint = useCallback((): { x: number; y: number } | null => {
        const activeId = activeNodeIdRef.current;
        if (activeId == null) return null;
        return nodeLayoutRef.current.get(activeId) ?? null;
    }, []);

    const nudgeGraphIntoView = useCallback(() => {
        const network = networkRef.current;
        if (!network || isDraggingViewRef.current) return;

        ensureGraphVisible(
            network,
            nodeLayoutRef.current,
            getCanvasSize(containerRef.current),
            preferVisibleCanvasPoint(),
        );
    }, [preferVisibleCanvasPoint]);

    const fitView = useCallback(
        (animate = true, padding = 56) => {
            const network = networkRef.current;
            const nodes = nodesDS.current;
            if (!network || !nodes || nodes.length === 0 || isDraggingViewRef.current) return;

            const ids = [...nodes.getIds()];
            runProgrammaticMove(() => {
                network.fit({
                    ...(ids.length > 0 ? { nodes: ids } : {}),
                    padding,
                    animation: animate
                        ? { duration: 400, easingFunction: 'easeInOutQuad' }
                        : false,
                });

                if (animate) {
                    const onDone = () => {
                        captureFitScale();
                        network.off('animationFinished', onDone);
                    };
                    network.on('animationFinished', onDone);
                } else {
                    requestAnimationFrame(captureFitScale);
                }
            });
        },
        [runProgrammaticMove, captureFitScale],
    );

    const zoomBy = useCallback(
        (factor: number) => {
            const network = networkRef.current;
            const container = containerRef.current;
            if (!network || !container) return;

            const canvasSize = getCanvasSize(container);
            const limits = getZoomLimits();
            const activeId = activeNodeIdRef.current;
            let anchorDom = { x: canvasSize.width / 2, y: canvasSize.height / 2 };

            if (activeId != null) {
                const pos = nodeLayoutRef.current.get(activeId);
                if (pos) {
                    anchorDom = network.canvasToDOM(pos);
                    anchorDom.x = Math.max(0, Math.min(canvasSize.width, anchorDom.x));
                    anchorDom.y = Math.max(0, Math.min(canvasSize.height, anchorDom.y));
                }
            }

            runProgrammaticMove(() => {
                zoomAtDomPoint(network, anchorDom, factor, canvasSize, limits);
                nudgeGraphIntoView();
            }, 220);
        },
        [runProgrammaticMove, getZoomLimits, nudgeGraphIntoView],
    );

    const focusNodeById = useCallback(
        (id: number | string, preserveScale = false) => {
            const network = networkRef.current;
            if (!network || !nodesDS.current?.get(id) || isDraggingViewRef.current) return;

            const pos = nodeLayoutRef.current.get(id);
            if (!pos) return;

            const moveOpts = buildFocusMoveTo(
                pos,
                preserveScale ? network.getScale() : undefined,
                getCanvasSize(containerRef.current),
            );

            runProgrammaticMove(() => network.moveTo(moveOpts));
        },
        [runProgrammaticMove],
    );

    const applyView = useCallback(
        (scope: GraphViewScope, groupId: string | null, animate = true) => {
            const network = networkRef.current;
            const data = payloadRef.current;
            if (!network || !data || !nodesDS.current || !edgesDS.current) return;

            const isGroupView = scope === 'groups';
            const viewKey = `${scope}:${groupId ?? ''}`;
            const viewChanged = viewKeyRef.current !== viewKey;
            viewKeyRef.current = viewKey;

            network.setOptions(
                buildViewGraphOptions(
                    themeRef.current,
                    'view',
                    visibleNodeCount(data, scope, groupId),
                    isGroupView,
                ),
            );

            nodesDS.current.clear();
            edgesDS.current.clear();

            if (isGroupView) {
                const { nodes, edges } = buildGroupSuperGraph(
                    data.groups,
                    data.groupEdges,
                    themeRef.current === 'dark',
                );
                const positions = layoutGroups(data.groups);
                nodeLayoutRef.current = positions;
                nodesDS.current.add(nodes);
                edgesDS.current.add(edges);
            } else if (groupId) {
                const { nodes, edges } = filterGraphByGroup(data.nodes, data.edges, groupId);
                const layout = layoutTopicsInGroup(nodes);
                nodeLayoutRef.current = layout;
                nodesDS.current.add(
                    styledTopicNodes(
                        nodes,
                        layout,
                        activeNodeIdRef.current,
                        themeRef.current === 'dark',
                    ),
                );
                edgesDS.current.add(edges);
            }

            if (viewChanged && animate && nodesDS.current.length > 0) {
                requestAnimationFrame(() => fitView(true, isGroupView ? 88 : 56));
            }
        },
        [fitView],
    );

    const highlightTopicNode = useCallback((nodeId: number) => {
        const data = payloadRef.current;
        const groupId = selectedGroupIdRef.current;
        if (!data || !nodesDS.current || viewScopeRef.current !== 'topics' || !groupId) return;

        const visibleNodes = data.nodes.filter((n) => n.groupId === groupId);
        patchTopicHighlight(
            nodesDS.current,
            visibleNodes,
            nodeId,
            prevActiveNodeIdRef.current,
        );
        prevActiveNodeIdRef.current = nodeId;
    }, []);

    const patchGroupStyles = useCallback(() => {
        const data = payloadRef.current;
        if (!data || !nodesDS.current || !edgesDS.current || viewScopeRef.current !== 'groups') {
            return;
        }

        const isDark = themeRef.current === 'dark';
        const { nodes, edges } = buildGroupSuperGraph(data.groups, data.groupEdges, isDark);
        nodesDS.current.update(nodes);
        edgesDS.current.update(edges);
    }, []);

    const patchTopicStyles = useCallback(() => {
        const data = payloadRef.current;
        const groupId = selectedGroupIdRef.current;
        if (!data || !nodesDS.current || viewScopeRef.current !== 'topics' || !groupId) return;

        const { nodes } = filterGraphByGroup(data.nodes, data.edges, groupId);
        const layout = layoutTopicsInGroup(nodes);
        nodeLayoutRef.current = layout;
        nodesDS.current.update(
            styledTopicNodes(
                nodes,
                layout,
                activeNodeIdRef.current,
                themeRef.current === 'dark',
            ),
        );
    }, []);

    handleNodePickRef.current = (rawId: number | string) => {
        if (isGroupNodeId(rawId)) {
            onGroupSelectRef.current?.(groupIdFromNodeId(String(rawId)));
            return;
        }

        if (viewScopeRef.current !== 'topics') return;

        const nodeId = typeof rawId === 'number' ? rawId : Number(rawId);
        if (Number.isNaN(nodeId)) return;

        activeNodeIdRef.current = nodeId;
        onNodeClickRef.current?.(nodeId);
        highlightTopicNode(nodeId);
        focusNodeById(nodeId, false);
        localStorage.setItem('lastFocusedNodeId', nodeId.toString());
    };

    handleGroupPickRef.current = (groupId: string) => {
        const now = Date.now();
        if (now - lastGroupPickAtRef.current < 250) return;
        lastGroupPickAtRef.current = now;
        onGroupSelectRef.current?.(groupId);
    };

    // Ініціалізація vis-network один раз
    useEffect(() => {
        if (!containerRef.current || networkRef.current) return;

        const container = containerRef.current;
        nodesDS.current = new DataSet([]);
        edgesDS.current = new DataSet([]);

        const network = new Network(
            container,
            { nodes: nodesDS.current, edges: edgesDS.current },
            buildViewGraphOptions(themeRef.current, 'view', 500, true),
        );
        networkRef.current = network;

        network.on('dragStart', () => {
            isDraggingViewRef.current = true;
        });
        network.on('dragEnd', () => {
            isDraggingViewRef.current = false;
        });

        const tryPickAtClient = (clientX: number, clientY: number) => {
            if (viewScopeRef.current === 'groups') return;

            const down = pointerDownRef.current;
            pointerDownRef.current = null;
            if (!down) return;
            if (Math.hypot(clientX - down.x, clientY - down.y) > CLICK_SLOP_PX) return;

            const net = networkRef.current;
            if (!net) return;

            const rect = container.getBoundingClientRect();
            const nodeId = net.getNodeAt({
                x: clientX - rect.left,
                y: clientY - rect.top,
            });
            if (nodeId == null) return;

            handleNodePickRef.current(nodeId);
        };

        const tryPickGroupAtClient = (clientX: number, clientY: number) => {
            if (viewScopeRef.current !== 'groups') return;

            const down = pointerDownRef.current;
            pointerDownRef.current = null;
            if (!down) return;
            if (Math.hypot(clientX - down.x, clientY - down.y) > CLICK_SLOP_PX) return;

            const net = networkRef.current;
            if (!net) return;

            const rect = container.getBoundingClientRect();
            const nodeId = net.getNodeAt({
                x: clientX - rect.left,
                y: clientY - rect.top,
            });
            if (nodeId == null || !isGroupNodeId(nodeId)) return;

            handleGroupPickRef.current(groupIdFromNodeId(String(nodeId)));
        };

        network.on('click', (params) => {
            if (viewScopeRef.current !== 'groups') return;
            pointerDownRef.current = null;

            const groupId = resolveGroupClickId(params);
            if (groupId) handleGroupPickRef.current(groupId);
        });

        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0) return;
            pointerDownRef.current = { x: e.clientX, y: e.clientY };
        };
        const onMouseUp = (e: MouseEvent) => {
            if (e.button !== 0) return;
            if (viewScopeRef.current === 'groups') {
                tryPickGroupAtClient(e.clientX, e.clientY);
            } else {
                tryPickAtClient(e.clientX, e.clientY);
            }
        };
        const onTouchStart = (e: TouchEvent) => {
            const t = e.changedTouches[0];
            if (!t) return;
            pointerDownRef.current = { x: t.clientX, y: t.clientY };
        };
        const onTouchEnd = (e: TouchEvent) => {
            const t = e.changedTouches[0];
            if (!t) return;
            if (viewScopeRef.current === 'groups') {
                tryPickGroupAtClient(t.clientX, t.clientY);
            } else {
                tryPickAtClient(t.clientX, t.clientY);
            }
        };

        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mouseup', onMouseUp);
        container.addEventListener('touchstart', onTouchStart, { passive: true });
        container.addEventListener('touchend', onTouchEnd, { passive: true });

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const net = networkRef.current;
            if (!net) return;

            const rect = container.getBoundingClientRect();
            const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const canvasSize = { width: rect.width, height: rect.height };
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

            zoomAtDomPoint(net, pointer, factor, canvasSize, getZoomLimits());
            nudgeGraphIntoView();
        };

        container.addEventListener('wheel', handleWheel, { passive: false });

        window.__focusGraphNode = (id: number) => {
            activeNodeIdRef.current = id;
            focusNodeById(id, false);
        };
        window.__fitGraphView = () => fitView();

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mouseup', onMouseUp);
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('touchend', onTouchEnd);
            window.__focusGraphNode = undefined;
            window.__fitGraphView = undefined;
            network.destroy();
            networkRef.current = null;
            nodesDS.current = null;
            edgesDS.current = null;
        };
    }, [fitView, focusNodeById, highlightTopicNode, getZoomLimits, nudgeGraphIntoView]);

    // Оновлення даних / перемикання scope
    useEffect(() => {
        if (!networkRef.current || !payload) return;

        const viewKey = `${viewScope}:${selectedGroupId ?? ''}`;
        const sameView =
            viewKeyRef.current === viewKey &&
            nodesDS.current != null &&
            nodesDS.current.length > 0;

        if (sameView && viewScope === 'topics') {
            patchTopicStyles();
            return;
        }

        applyView(viewScope, selectedGroupId, true);
    }, [payload, viewScope, selectedGroupId, applyView, patchTopicStyles]);

    // Підсвітка обраної теми (без повторного фокусу камери)
    useEffect(() => {
        if (viewScope !== 'topics' || !nodesDS.current || !payload) return;
        if (activeNodeId == null) return;
        if (activeNodeId === prevActiveNodeIdRef.current) return;

        highlightTopicNode(activeNodeId);
    }, [activeNodeId, viewScope, selectedGroupId, highlightTopicNode]);

    useEffect(() => {
        if (!networkRef.current || isDraggingViewRef.current) return;
        networkRef.current.setOptions(
            buildViewGraphOptions(
                theme,
                'view',
                payload
                    ? visibleNodeCount(payload, viewScope, selectedGroupId)
                    : 0,
                viewScope === 'groups',
            ),
        );
        if (viewScope === 'topics') {
            patchTopicStyles();
        } else if (viewScope === 'groups') {
            patchGroupStyles();
        }
    }, [theme, viewScope, selectedGroupId, payload, patchTopicStyles, patchGroupStyles]);

    useEffect(() => {
        const el = shellRef.current;
        if (!el) return;

        let raf = 0;
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => networkRef.current?.redraw());
        });
        ro.observe(el);
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, []);

    const selectedGroup = payload?.groups.find((g) => g.id === selectedGroupId) ?? null;

    return (
        <div ref={shellRef} className="absolute inset-0 graph-map-shell overflow-hidden rounded-lg">
            <div ref={containerRef} className="absolute inset-0 z-0" />
            <GraphMapHUD
                viewScope={viewScope}
                groupTitle={selectedGroup?.title ?? null}
                activeNodeTitle={activeNodeTitle}
                onFit={() => fitView(true, viewScope === 'groups' ? 88 : 56)}
                onRecenter={() => {
                    const id = activeNodeIdRef.current;
                    if (id != null) focusNodeById(id, true);
                    else fitView();
                }}
                onZoomIn={() => zoomBy(1.2)}
                onZoomOut={() => zoomBy(1 / 1.2)}
                onBackToGroups={viewScope === 'topics' ? onBackToGroups : undefined}
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
