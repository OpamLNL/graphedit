import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildViewGraphOptions } from './graphStyles';
import GraphMapHUD from './GraphMapHUD';
import {
    applyStoredViewport,
    buildFocusMoveTo,
    ensureGraphVisible,
    fitViewTopAnchored,
    limitsFromFitScale,
    zoomAtDomPoint,
} from '../../utils/graphViewport';
import {
    loadStoredViewport,
    saveStoredViewport,
    viewportStorageKey,
} from '../../utils/graphViewportStorage';
import { isolatedNodeIds } from '../../utils/graphLayout';
import {
    buildGroupSuperGraph,
    filterGraphByGroup,
    getSoloGroupIds,
    groupIdFromNodeId,
    isGroupNodeId,
    layoutGroups,
    layoutTopicsInGroup,
    patchGroupHighlight,
    patchTopicHighlight,
    styledTopicEdges,
    styledTopicNodes,
} from '../../utils/groupGraph';

export interface NodeData {
    id: number;
    label: string;
    title: string;
    topicId: number | null;
    x: number | null;
    y: number | null;
    level: number;
    groupId: string | null;
    orderInGroup?: number;
    globalOrder?: number | null;
    progress: number;
    status: 'completed' | 'available' | 'locked';
    color?: string | null;
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
    x?: number | null;
    y?: number | null;
}

export interface GroupEdgeData {
    id?: number;
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
    editMode?: boolean;
    connectMode?: boolean;
    connectSourceId?: number | null;
    activeGroupId?: string | null;
    connectSourceGroupId?: string | null;
    onGroupSelect?: (groupId: string) => void;
    onGroupClick?: (groupId: string) => void;
    onNodeClick?: (nodeId: number) => void;
    onConnectSourceChange?: (nodeId: number | null) => void;
    onConnectSourceGroupChange?: (groupId: string | null) => void;
    onConnectNodes?: (fromId: number, toId: number) => void;
    onConnectGroups?: (fromGroupId: string, toGroupId: string) => void;
    onEdgesDelete?: (edges: { from: number; to: number; id?: string }[]) => void;
    onGroupEdgesDelete?: (edges: { from: string; to: string; id?: number }[]) => void;
    onNodePositionChange?: (nodeId: number, x: number, y: number) => void;
    onGroupPositionChange?: (groupId: string, x: number, y: number) => void;
    onBackToGroups?: () => void;
    onClearSelection?: () => void;
    viewportStorageId?: number | string;
    /** Ref для зчитування поточних x/y тем перед збереженням */
    nodeLayoutReaderRef?: MutableRefObject<(() => Map<number, { x: number; y: number }>) | null>;
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function getCanvasSize(container: HTMLElement | null) {
    if (!container) return { width: 900, height: 600 };
    return { width: container.clientWidth || 900, height: container.clientHeight || 600 };
}

const CLICK_SLOP_PX = 12;

/** Точний hit-test vis-network; fallback — найближчий вузол у радіусі (для підпису біля dot) */
function pickNodeAtPointer(
    net: Network,
    pointer: { x: number; y: number },
    nodeIds: (number | string)[],
    maxRadiusPx: number,
): number | string | undefined {
    const direct = net.getNodeAt(pointer);
    if (direct != null) return direct;

    if (nodeIds.length === 0 || maxRadiusPx <= 0) return undefined;

    let best: number | string | undefined;
    let bestDist = maxRadiusPx * maxRadiusPx;
    const positions = net.getPositions(nodeIds);

    for (const id of nodeIds) {
        const pos = positions[id as number | string];
        if (!pos) continue;
        const dom = net.canvasToDOM({ x: pos.x, y: pos.y });
        const dx = dom.x - pointer.x;
        const dy = dom.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
            bestDist = d2;
            best = id;
        }
    }
    return best;
}

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
    activeGroupId = null,
    editMode = false,
    connectMode = false,
    connectSourceId = null,
    connectSourceGroupId = null,
    onGroupSelect,
    onGroupClick,
    onNodeClick,
    onConnectSourceChange,
    onConnectSourceGroupChange,
    onConnectNodes,
    onConnectGroups,
    onEdgesDelete,
    onGroupEdgesDelete,
    onNodePositionChange,
    onGroupPositionChange,
    onBackToGroups,
    onClearSelection,
    viewportStorageId,
    nodeLayoutReaderRef,
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
    const prevActiveGroupIdRef = useRef<string | null>(null);
    const activeGroupIdRef = useRef(activeGroupId);
    const activeNodeIdRef = useRef(activeNodeId);
    const programmaticMoveRef = useRef(false);
    const isDraggingViewRef = useRef(false);
    const viewKeyRef = useRef('');
    const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
    const handleNodePickRef = useRef<(rawId: number | string) => void>(() => {});
    const handleGroupPickRef = useRef<(groupId: string) => void>(() => {});
    const lastGroupPickAtRef = useRef(0);
    const skipNodePickRef = useRef(false);
    const fitScaleRef = useRef(0.85);
    const viewportStorageIdRef = useRef(viewportStorageId);
    const saveViewportTimerRef = useRef<number | null>(null);

    const onGroupSelectRef = useRef(onGroupSelect);
    const onGroupClickRef = useRef(onGroupClick);
    const onNodeClickRef = useRef(onNodeClick);
    const onConnectSourceChangeRef = useRef(onConnectSourceChange);
    const onConnectSourceGroupChangeRef = useRef(onConnectSourceGroupChange);
    const onConnectNodesRef = useRef(onConnectNodes);
    const onConnectGroupsRef = useRef(onConnectGroups);
    const onEdgesDeleteRef = useRef(onEdgesDelete);
    const onGroupEdgesDeleteRef = useRef(onGroupEdgesDelete);
    const onNodePositionChangeRef = useRef(onNodePositionChange);
    const onGroupPositionChangeRef = useRef(onGroupPositionChange);
    const onBackToGroupsRef = useRef(onBackToGroups);
    const onClearSelectionRef = useRef(onClearSelection);
    const editModeRef = useRef(editMode);
    const connectModeRef = useRef(connectMode);
    const connectSourceIdRef = useRef(connectSourceId);
    const connectSourceGroupIdRef = useRef(connectSourceGroupId);

    const { theme } = useTheme();
    const themeRef = useRef(theme);

    payloadRef.current = payload;
    viewScopeRef.current = viewScope;
    selectedGroupIdRef.current = selectedGroupId;
    activeNodeIdRef.current = activeNodeId ?? null;
    activeGroupIdRef.current = activeGroupId ?? null;
    themeRef.current = theme;
    onGroupSelectRef.current = onGroupSelect;
    onGroupClickRef.current = onGroupClick;
    onNodeClickRef.current = onNodeClick;
    onConnectSourceChangeRef.current = onConnectSourceChange;
    onConnectSourceGroupChangeRef.current = onConnectSourceGroupChange;
    onConnectNodesRef.current = onConnectNodes;
    onConnectGroupsRef.current = onConnectGroups;
    onEdgesDeleteRef.current = onEdgesDelete;
    onGroupEdgesDeleteRef.current = onGroupEdgesDelete;
    onNodePositionChangeRef.current = onNodePositionChange;
    onGroupPositionChangeRef.current = onGroupPositionChange;
    onBackToGroupsRef.current = onBackToGroups;
    onClearSelectionRef.current = onClearSelection;
    editModeRef.current = editMode;
    connectModeRef.current = connectMode;
    connectSourceIdRef.current = connectSourceId;
    connectSourceGroupIdRef.current = connectSourceGroupId;
    viewportStorageIdRef.current = viewportStorageId;

    useEffect(() => {
        if (!nodeLayoutReaderRef) return;
        nodeLayoutReaderRef.current = () => {
            const out = new Map<number, { x: number; y: number }>();
            for (const [id, pos] of nodeLayoutRef.current.entries()) {
                if (typeof id === 'number' && !Number.isNaN(id)) {
                    out.set(id, { x: Math.round(pos.x), y: Math.round(pos.y) });
                }
            }
            return out;
        };
        return () => {
            nodeLayoutReaderRef.current = null;
        };
    }, [nodeLayoutReaderRef]);

    const currentViewportKey = useCallback(() => {
        const id = viewportStorageIdRef.current;
        if (id == null) return null;
        return viewportStorageKey(id, viewScopeRef.current, selectedGroupIdRef.current);
    }, []);

    const persistUserViewport = useCallback(() => {
        if (programmaticMoveRef.current) return;
        const key = currentViewportKey();
        const network = networkRef.current;
        if (!key || !network) return;
        saveStoredViewport(key, network);
    }, [currentViewportKey]);

    const schedulePersistViewport = useCallback(() => {
        if (saveViewportTimerRef.current != null) {
            window.clearTimeout(saveViewportTimerRef.current);
        }
        saveViewportTimerRef.current = window.setTimeout(() => {
            saveViewportTimerRef.current = null;
            persistUserViewport();
        }, 280);
    }, [persistUserViewport]);

    const getFitExcludeIds = useCallback((): Set<string> | undefined => {
        const data = payloadRef.current;
        if (!data) return undefined;

        if (viewScopeRef.current === 'groups') {
            const solo = getSoloGroupIds(data.groups, data.groupEdges);
            return solo.size > 0 ? solo : undefined;
        }

        const groupId = selectedGroupIdRef.current;
        if (!groupId) return undefined;
        const { nodes, edges } = filterGraphByGroup(data.nodes, data.edges, groupId);
        const isolated = isolatedNodeIds(
            nodes.map((n) => n.id),
            edges.map((e) => ({ from: e.from, to: e.to })),
        );
        return isolated.size > 0 ? isolated : undefined;
    }, []);

    const runProgrammaticMove = useCallback((callback: () => void, duration = 400) => {
        programmaticMoveRef.current = true;
        callback();
        window.setTimeout(() => {
            programmaticMoveRef.current = false;
        }, duration);
    }, []);

    const applyViewportForView = useCallback(
        (animate = true) => {
            const network = networkRef.current;
            if (!network || !nodesDS.current || nodesDS.current.length === 0) return;

            const scope = viewScopeRef.current;
            const isGroupView = scope === 'groups';
            const key = currentViewportKey();
            const saved = key ? loadStoredViewport(key) : null;
            const canvasSize = getCanvasSize(containerRef.current);

            runProgrammaticMove(() => {
                if (saved) {
                    applyStoredViewport(network, saved, animate);
                    fitScaleRef.current = saved.scale;
                    return;
                }

                fitViewTopAnchored(network, nodeLayoutRef.current, canvasSize, {
                    excludeIds: getFitExcludeIds(),
                    padding: isGroupView ? 72 : 48,
                    topPadding: isGroupView ? 52 : 40,
                    viewScope: scope,
                    fitScaleRef,
                });
            }, animate ? 400 : 0);
        },
        [currentViewportKey, getFitExcludeIds, runProgrammaticMove],
    );

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
        (animate = true) => {
            const network = networkRef.current;
            const nodes = nodesDS.current;
            if (!network || !nodes || nodes.length === 0 || isDraggingViewRef.current) return;

            const scope = viewScopeRef.current;
            const isGroupView = scope === 'groups';
            const canvasSize = getCanvasSize(containerRef.current);
            const key = currentViewportKey();

            runProgrammaticMove(() => {
                fitViewTopAnchored(network, nodeLayoutRef.current, canvasSize, {
                    excludeIds: getFitExcludeIds(),
                    padding: isGroupView ? 72 : 48,
                    topPadding: isGroupView ? 52 : 40,
                    viewScope: scope,
                    fitScaleRef,
                });
                if (key) saveStoredViewport(key, network);
            }, animate ? 400 : 0);
        },
        [runProgrammaticMove, currentViewportKey, getFitExcludeIds],
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
                schedulePersistViewport();
            }, 220);
        },
        [runProgrammaticMove, getZoomLimits, nudgeGraphIntoView, schedulePersistViewport],
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
                    editModeRef.current ? 'edit' : 'view',
                    visibleNodeCount(data, scope, groupId),
                    isGroupView,
                ),
            );

            nodesDS.current.clear();
            edgesDS.current.clear();

            if (isGroupView) {
                const layout = layoutGroups(data.groups, data.groupEdges, {
                    editMode: editModeRef.current,
                });
                nodeLayoutRef.current = layout;
                const { nodes, edges } = buildGroupSuperGraph(
                    data.groups,
                    data.groupEdges,
                    themeRef.current === 'dark',
                    activeGroupIdRef.current,
                    connectSourceGroupIdRef.current,
                    editModeRef.current,
                    layout,
                );
                nodesDS.current.add(nodes);
                edgesDS.current.add(edges);
            } else if (groupId) {
                const { nodes, edges } = filterGraphByGroup(data.nodes, data.edges, groupId);
                const layout = layoutTopicsInGroup(nodes, edges, {
                    editMode: editModeRef.current,
                });
                nodeLayoutRef.current = layout;
                nodesDS.current.add(
                    styledTopicNodes(
                        nodes,
                        layout,
                        activeNodeIdRef.current,
                        themeRef.current === 'dark',
                        connectSourceIdRef.current,
                        editModeRef.current,
                    ),
                );
                edgesDS.current.add(
                    editModeRef.current ? styledTopicEdges(edges, true) : edges,
                );
            }

            if (viewChanged && animate && nodesDS.current.length > 0) {
                requestAnimationFrame(() => applyViewportForView(true));
            }
        },
        [applyViewportForView],
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
            connectSourceIdRef.current,
            editModeRef.current,
        );
        prevActiveNodeIdRef.current = nodeId;
    }, []);

    const patchGroupStyles = useCallback((fullLayout = false) => {
        const data = payloadRef.current;
        if (!data || !nodesDS.current || !edgesDS.current || viewScopeRef.current !== 'groups') {
            return;
        }

        const isDark = themeRef.current === 'dark';
        const styleOnly = editModeRef.current && !fullLayout;

        let layout: Map<string, { x: number; y: number }>;
        if (styleOnly) {
            layout = new Map(nodeLayoutRef.current);
            const computed = layoutGroups(data.groups, data.groupEdges, { editMode: true });
            const groupIds = new Set(data.groups.map((g) => g.id));
            for (const g of data.groups) {
                if (!layout.has(g.id)) {
                    layout.set(g.id, computed.get(g.id) ?? { x: 0, y: 0 });
                }
            }
            for (const id of [...layout.keys()]) {
                if (!groupIds.has(String(id))) layout.delete(id);
            }
        } else {
            layout = layoutGroups(data.groups, data.groupEdges, {
                editMode: editModeRef.current,
            });
        }
        nodeLayoutRef.current = layout;

        const styled = buildGroupSuperGraph(
            data.groups,
            data.groupEdges,
            isDark,
            activeGroupIdRef.current,
            connectSourceGroupIdRef.current,
            editModeRef.current,
            layout,
        );

        if (styleOnly) {
            nodesDS.current.update(
                styled.nodes.map((node) => {
                    const { x: _x, y: _y, ...visual } = node as {
                        x?: number;
                        y?: number;
                        id: string;
                    };
                    return { ...visual, fixed: false };
                }),
            );
        } else {
            nodesDS.current.update(styled.nodes);
        }

        edgesDS.current.clear();
        edgesDS.current.add(styled.edges);
    }, []);

    const patchTopicStyles = useCallback((fullLayout = false) => {
        const data = payloadRef.current;
        const groupId = selectedGroupIdRef.current;
        if (!data || !nodesDS.current || viewScopeRef.current !== 'topics' || !groupId) return;

        const { nodes, edges } = filterGraphByGroup(data.nodes, data.edges, groupId);
        const styleOnly = editModeRef.current && !fullLayout;

        let layout: Map<number, { x: number; y: number }>;
        if (styleOnly) {
            layout = new Map(nodeLayoutRef.current);
            const computed = layoutTopicsInGroup(nodes, edges, { editMode: true });
            const nodeIds = new Set(nodes.map((n) => n.id));
            for (const n of nodes) {
                if (!layout.has(n.id)) {
                    layout.set(n.id, computed.get(n.id) ?? { x: 0, y: 0 });
                }
            }
            for (const id of [...layout.keys()]) {
                if (!nodeIds.has(id as number)) layout.delete(id);
            }
        } else {
            layout = layoutTopicsInGroup(nodes, edges, {
                editMode: editModeRef.current,
            });
        }
        nodeLayoutRef.current = layout;

        const styled = styledTopicNodes(
            nodes,
            layout,
            activeNodeIdRef.current,
            themeRef.current === 'dark',
            connectSourceIdRef.current,
            editModeRef.current,
        );

        if (styleOnly) {
            nodesDS.current.update(
                styled.map((node) => {
                    const { x: _x, y: _y, ...visual } = node as {
                        x?: number;
                        y?: number;
                        id: number;
                    };
                    return { ...visual, fixed: false };
                }),
            );
        } else {
            nodesDS.current.update(styled);
        }

        edgesDS.current.clear();
        edgesDS.current.add(
            editModeRef.current ? styledTopicEdges(edges, true) : edges,
        );
    }, []);

    handleNodePickRef.current = (rawId: number | string) => {
        if (isGroupNodeId(rawId)) {
            if (editModeRef.current && viewScopeRef.current === 'groups') {
                handleGroupPickRef.current(groupIdFromNodeId(String(rawId)));
            } else {
                onGroupSelectRef.current?.(groupIdFromNodeId(String(rawId)));
            }
            return;
        }

        if (viewScopeRef.current !== 'topics') return;

        const nodeId = typeof rawId === 'number' ? rawId : Number(rawId);
        if (Number.isNaN(nodeId)) return;

        if (editModeRef.current && connectModeRef.current) {
            const sourceId = connectSourceIdRef.current;
            if (sourceId == null) {
                onConnectSourceChangeRef.current?.(nodeId);
                onNodeClickRef.current?.(nodeId);
                patchTopicHighlight(
                    nodesDS.current!,
                    payloadRef.current!.nodes.filter(
                        (n) => n.groupId === selectedGroupIdRef.current,
                    ),
                    nodeId,
                    prevActiveNodeIdRef.current,
                    nodeId,
                    editModeRef.current,
                );
                prevActiveNodeIdRef.current = nodeId;
                activeNodeIdRef.current = nodeId;
                return;
            }
            if (sourceId === nodeId) {
                onConnectSourceChangeRef.current?.(null);
                return;
            }
            onConnectNodesRef.current?.(sourceId, nodeId);
            onConnectSourceChangeRef.current?.(null);
            return;
        }

        activeNodeIdRef.current = nodeId;
        onNodeClickRef.current?.(nodeId);
        highlightTopicNode(nodeId);
        if (!editModeRef.current) {
            focusNodeById(nodeId, false);
            localStorage.setItem('lastFocusedNodeId', nodeId.toString());
        }
    };

    handleGroupPickRef.current = (groupId: string) => {
        const now = Date.now();
        if (now - lastGroupPickAtRef.current < 250) return;
        lastGroupPickAtRef.current = now;

        if (viewScopeRef.current !== 'groups') return;

        if (editModeRef.current) {
            if (connectModeRef.current) {
                const sourceId = connectSourceGroupIdRef.current;
                if (sourceId == null) {
                    onConnectSourceGroupChangeRef.current?.(groupId);
                    onGroupClickRef.current?.(groupId);
                    activeGroupIdRef.current = groupId;
                    patchGroupHighlight(
                        nodesDS.current!,
                        payloadRef.current!.groups,
                        groupId,
                        prevActiveGroupIdRef.current,
                        groupId,
                        themeRef.current === 'dark',
                        editModeRef.current,
                    );
                    prevActiveGroupIdRef.current = groupId;
                    return;
                }
                if (sourceId === groupId) {
                    onConnectSourceGroupChangeRef.current?.(null);
                    patchGroupStyles();
                    return;
                }
                onConnectGroupsRef.current?.(sourceId, groupId);
                onConnectSourceGroupChangeRef.current?.(null);
                patchGroupStyles();
                return;
            }

            activeGroupIdRef.current = groupId;
            onGroupClickRef.current?.(groupId);
            patchGroupHighlight(
                nodesDS.current!,
                payloadRef.current!.groups,
                groupId,
                prevActiveGroupIdRef.current,
                connectSourceGroupIdRef.current,
                themeRef.current === 'dark',
                editModeRef.current,
            );
            prevActiveGroupIdRef.current = groupId;
            return;
        }

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

        const pickEdgeAtPointer = (net: Network, pointer: { x: number; y: number }) => {
            const edgeId = net.getEdgeAt(pointer);
            if (edgeId == null) return false;
            net.unselectAll();
            net.selectEdges([edgeId]);
            onClearSelectionRef.current?.();
            return true;
        };

        network.on('dragStart', (params) => {
            isDraggingViewRef.current = !(params.nodes && params.nodes.length > 0);
        });
        network.on('dragEnd', (params) => {
            if (params.nodes && params.nodes.length > 0 && editModeRef.current) {
                skipNodePickRef.current = true;
                const positions = network.getPositions(params.nodes);
                for (const rawId of params.nodes) {
                    const pos = positions[rawId];
                    if (!pos) continue;
                    if (isGroupNodeId(rawId)) {
                        const groupId = groupIdFromNodeId(String(rawId));
                        nodeLayoutRef.current.set(groupId, { x: pos.x, y: pos.y });
                        onGroupPositionChangeRef.current?.(groupId, pos.x, pos.y);
                        continue;
                    }
                    const nodeId = typeof rawId === 'number' ? rawId : Number(rawId);
                    if (!Number.isNaN(nodeId)) {
                        nodeLayoutRef.current.set(nodeId, { x: pos.x, y: pos.y });
                        onNodePositionChangeRef.current?.(nodeId, pos.x, pos.y);
                    }
                }
            } else if (isDraggingViewRef.current) {
                persistUserViewport();
            }
            isDraggingViewRef.current = false;
        });

        const tryPickAtClient = (clientX: number, clientY: number) => {
            if (viewScopeRef.current === 'groups') return;

            if (skipNodePickRef.current) {
                skipNodePickRef.current = false;
                pointerDownRef.current = null;
                return;
            }

            const down = pointerDownRef.current;
            pointerDownRef.current = null;
            if (!down) return;
            if (Math.hypot(clientX - down.x, clientY - down.y) > CLICK_SLOP_PX) return;

            const net = networkRef.current;
            if (!net) return;

            const rect = container.getBoundingClientRect();
            const pointer = { x: clientX - rect.left, y: clientY - rect.top };
            const visibleIds = (nodesDS.current?.getIds() ?? []).filter(
                (id) => !isGroupNodeId(id),
            );
            const pickRadius = editModeRef.current ? 18 : 56;
            const nodeId = pickNodeAtPointer(net, pointer, visibleIds, pickRadius);

            if (editModeRef.current && !connectModeRef.current) {
                if (pickEdgeAtPointer(net, pointer)) return;

                if (nodeId == null) {
                    net.unselectAll();
                    onClearSelectionRef.current?.();
                    return;
                }
            }

            if (nodeId == null) return;

            if (editModeRef.current && !connectModeRef.current) {
                net.unselectAll();
                net.selectNodes([nodeId]);
            }

            handleNodePickRef.current(nodeId);
        };

        const tryPickGroupAtClient = (clientX: number, clientY: number) => {
            if (viewScopeRef.current !== 'groups') return;

            if (skipNodePickRef.current) {
                skipNodePickRef.current = false;
                pointerDownRef.current = null;
                return;
            }

            const down = pointerDownRef.current;
            pointerDownRef.current = null;
            if (!down) return;
            if (Math.hypot(clientX - down.x, clientY - down.y) > CLICK_SLOP_PX) return;

            const net = networkRef.current;
            if (!net) return;

            const rect = container.getBoundingClientRect();
            const pointer = { x: clientX - rect.left, y: clientY - rect.top };

            if (editModeRef.current && !connectModeRef.current) {
                if (pickEdgeAtPointer(net, pointer)) return;

                const nodeAt = net.getNodeAt(pointer);
                if (nodeAt == null) {
                    net.unselectAll();
                    onClearSelectionRef.current?.();
                    return;
                }
            }

            const nodeId = net.getNodeAt(pointer);
            if (nodeId == null || !isGroupNodeId(nodeId)) return;

            if (editModeRef.current && !connectModeRef.current) {
                net.unselectAll();
                net.selectNodes([nodeId]);
            }

            handleGroupPickRef.current(groupIdFromNodeId(String(nodeId)));
        };

        network.on('click', (params) => {
            if (viewScopeRef.current === 'groups') {
                if (
                    editModeRef.current &&
                    !connectModeRef.current &&
                    params.edges &&
                    params.edges.length > 0
                ) {
                    skipNodePickRef.current = true;
                    network.unselectAll();
                    network.selectEdges(params.edges);
                    onClearSelectionRef.current?.();
                    pointerDownRef.current = null;
                    return;
                }

                if (
                    editModeRef.current &&
                    connectModeRef.current &&
                    (!params.nodes || params.nodes.length === 0) &&
                    (!params.edges || params.edges.length === 0)
                ) {
                    onConnectSourceGroupChangeRef.current?.(null);
                    patchGroupStyles();
                }
                pointerDownRef.current = null;

                const groupId = resolveGroupClickId(params);
                if (groupId) handleGroupPickRef.current(groupId);
                return;
            }

            if (
                editModeRef.current &&
                !connectModeRef.current &&
                params.edges &&
                params.edges.length > 0
            ) {
                skipNodePickRef.current = true;
                network.unselectAll();
                network.selectEdges(params.edges);
                onClearSelectionRef.current?.();
                pointerDownRef.current = null;
                return;
            }

            if (
                editModeRef.current &&
                !connectModeRef.current &&
                (!params.nodes || params.nodes.length === 0) &&
                (!params.edges || params.edges.length === 0)
            ) {
                network.unselectAll();
                onClearSelectionRef.current?.();
                pointerDownRef.current = null;
                return;
            }

            if (
                editModeRef.current &&
                connectModeRef.current &&
                (!params.nodes || params.nodes.length === 0) &&
                (!params.edges || params.edges.length === 0)
            ) {
                onConnectSourceChangeRef.current?.(null);
            }
        });

        const onKeyDown = (e: KeyboardEvent) => {
            if (!editModeRef.current) return;
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (isEditableTarget(e.target)) return;

            const net = networkRef.current;
            const eds = edgesDS.current;
            if (!net || !eds) return;

            const selectedEdges = net.getSelectedEdges();
            const selectedNodes = net.getSelectedNodes();

            if (selectedEdges.length === 0 && selectedNodes.length === 0) return;

            e.preventDefault();
            e.stopPropagation();

            if (selectedEdges.length === 0) {
                // Del з обраним вузлом — не видаляємо вузол з клавіатури (лише кнопка в панелі)
                return;
            }

            if (viewScopeRef.current === 'groups') {
                const toDelete = selectedEdges.map((edgeId) => {
                    const edge = eds.get(edgeId) as { from: string; to: string };
                    return {
                        from: groupIdFromNodeId(String(edge.from)),
                        to: groupIdFromNodeId(String(edge.to)),
                        id: String(edgeId).startsWith('ge-')
                            ? Number(String(edgeId).replace(/^ge-(\d+)$/, '$1')) || undefined
                            : undefined,
                    };
                });
                onGroupEdgesDeleteRef.current?.(toDelete);
                eds.remove(selectedEdges);
                net.unselectAll();
                return;
            }

            if (viewScopeRef.current !== 'topics') return;
            const toDelete = selectedEdges.map((edgeId) => {
                const edge = eds.get(edgeId) as { from: number; to: number };
                return { from: Number(edge.from), to: Number(edge.to), id: String(edgeId) };
            });
            onEdgesDeleteRef.current?.(toDelete);
            eds.remove(selectedEdges);
            net.unselectAll();
        };
        window.addEventListener('keydown', onKeyDown);

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
            schedulePersistViewport();
        };

        container.addEventListener('wheel', handleWheel, { passive: false });

        window.__focusGraphNode = (id: number) => {
            activeNodeIdRef.current = id;
            focusNodeById(id, false);
        };
        window.__fitGraphView = () => fitView();

        return () => {
            if (saveViewportTimerRef.current != null) {
                window.clearTimeout(saveViewportTimerRef.current);
            }
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mouseup', onMouseUp);
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('touchend', onTouchEnd);
            window.removeEventListener('keydown', onKeyDown);
            window.__focusGraphNode = undefined;
            window.__fitGraphView = undefined;
            network.destroy();
            networkRef.current = null;
            nodesDS.current = null;
            edgesDS.current = null;
        };
    }, [fitView, focusNodeById, highlightTopicNode, getZoomLimits, nudgeGraphIntoView, schedulePersistViewport, persistUserViewport]);

    // Оновлення даних / перемикання scope
    useEffect(() => {
        if (!networkRef.current || !payload) return;

        const viewKey = `${viewScope}:${selectedGroupId ?? ''}`;
        const sameView =
            viewKeyRef.current === viewKey &&
            nodesDS.current != null &&
            nodesDS.current.length > 0;

        if (sameView && viewScope === 'groups') {
            patchGroupStyles(true);
            return;
        }

        if (sameView && viewScope === 'topics') {
            patchTopicStyles(true);
            return;
        }

        applyView(viewScope, selectedGroupId, true);
    }, [payload, viewScope, selectedGroupId, applyView, patchTopicStyles, patchGroupStyles]);

    useEffect(() => {
        if (viewScope !== 'groups' || !nodesDS.current || !payload) return;
        if (activeGroupId == null) return;
        if (activeGroupId === prevActiveGroupIdRef.current) return;

        patchGroupHighlight(
            nodesDS.current,
            payload.groups,
            activeGroupId,
            prevActiveGroupIdRef.current,
            connectSourceGroupId,
            themeRef.current === 'dark',
            editModeRef.current,
        );
        prevActiveGroupIdRef.current = activeGroupId;
    }, [activeGroupId, viewScope, payload, connectSourceGroupId]);

    useEffect(() => {
        if (viewScope !== 'groups' || !nodesDS.current) return;
        patchGroupStyles(true);
    }, [connectSourceGroupId, connectMode, editMode, viewScope, patchGroupStyles]);

    // Підсвітка обраної теми (без повторного фокусу камери)
    useEffect(() => {
        if (viewScope !== 'topics' || !nodesDS.current || !payload) return;
        if (activeNodeId == null) return;
        if (activeNodeId === prevActiveNodeIdRef.current) return;

        highlightTopicNode(activeNodeId);
    }, [activeNodeId, viewScope, selectedGroupId, highlightTopicNode]);

    useEffect(() => {
        if (viewScope !== 'topics' || !nodesDS.current) return;
        patchTopicStyles(true);
    }, [connectSourceId, connectMode, editMode, viewScope, patchTopicStyles]);

    useEffect(() => {
        if (!networkRef.current || isDraggingViewRef.current) return;
        networkRef.current.setOptions(
            buildViewGraphOptions(
                theme,
                editMode ? 'edit' : 'view',
                payload
                    ? visibleNodeCount(payload, viewScope, selectedGroupId)
                    : 0,
                viewScope === 'groups',
            ),
        );
    }, [theme, editMode, viewScope, selectedGroupId, payload]);

    useEffect(() => {
        const el = shellRef.current;
        if (!el) return;

        let raf = 0;
        let lastW = 0;
        let lastH = 0;
        const ro = new ResizeObserver((entries) => {
            const rect = entries[0]?.contentRect;
            if (!rect) return;
            if (Math.abs(rect.width - lastW) < 1 && Math.abs(rect.height - lastH) < 1) return;
            lastW = rect.width;
            lastH = rect.height;
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
    const activeGroup = payload?.groups.find((g) => g.id === activeGroupId) ?? null;

    return (
        <div ref={shellRef} className="absolute inset-0 graph-map-shell overflow-hidden rounded-lg">
            <div ref={containerRef} className="absolute inset-0 z-0" />
            <GraphMapHUD
                viewScope={viewScope}
                groupTitle={selectedGroup?.title ?? null}
                activeGroupTitle={activeGroup?.title ?? null}
                activeNodeTitle={activeNodeTitle}
                editMode={editMode}
                connectMode={connectMode}
                onFit={() => fitView(true)}
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
