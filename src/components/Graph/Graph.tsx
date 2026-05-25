import { useCallback, useEffect, useRef } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildViewGraphOptions } from './graphStyles';
import GraphMapHUD from './GraphMapHUD';
import { buildFocusMoveTo } from '../../utils/graphViewport';
import {
    buildGroupSuperGraph,
    filterGraphByGroup,
    groupIdFromNodeId,
    isGroupNodeId,
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
    const topicLayoutRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const prevActiveNodeIdRef = useRef<number | null>(null);
    const activeNodeIdRef = useRef(activeNodeId);
    const programmaticMoveRef = useRef(false);

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
            const nodes = nodesDS.current;
            if (!network || !nodes || nodes.length === 0) return;

            const ids = [...nodes.getIds()];
            runProgrammaticMove(() => {
                network.fit({
                    ...(ids.length > 0 ? { nodes: ids } : {}),
                    padding: 56,
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
            runProgrammaticMove(() => {
                network.moveTo({
                    scale: Math.min(3, Math.max(0.08, network.getScale() * factor)),
                    animation: { duration: 180, easingFunction: 'easeInOutQuad' },
                });
            }, 220);
        },
        [runProgrammaticMove],
    );

    const focusNodeById = useCallback(
        (id: number, preserveScale = false) => {
            const network = networkRef.current;
            if (!network || !nodesDS.current?.get(id)) return;

            const pos = topicLayoutRef.current.get(id);
            if (!pos) return;

            network.selectNodes([id]);
            const moveOpts = buildFocusMoveTo(
                pos,
                preserveScale ? network.getScale() : undefined,
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

            network.setOptions(
                buildViewGraphOptions(themeRef.current, 'view', data.nodes.length, isGroupView),
            );

            nodesDS.current.clear();
            edgesDS.current.clear();

            if (isGroupView) {
                const { nodes, edges } = buildGroupSuperGraph(data.groups, data.groupEdges);
                nodesDS.current.add(nodes);
                edgesDS.current.add(edges);
                topicLayoutRef.current = new Map();
            } else if (groupId) {
                const { nodes, edges } = filterGraphByGroup(data.nodes, data.edges, groupId);
                const layout = layoutTopicsInGroup(nodes);
                topicLayoutRef.current = layout;
                nodesDS.current.add(
                    styledTopicNodes(nodes, layout, activeNodeIdRef.current),
                );
                edgesDS.current.add(edges);
            }

            if (animate && nodesDS.current.length > 0) {
                requestAnimationFrame(() => fitView());
            }
        },
        [fitView],
    );

    // Ініціалізація vis-network один раз (без remount при зміні payload)
    useEffect(() => {
        if (!containerRef.current || networkRef.current) return;

        nodesDS.current = new DataSet([]);
        edgesDS.current = new DataSet([]);

        const network = new Network(
            containerRef.current,
            { nodes: nodesDS.current, edges: edgesDS.current },
            buildViewGraphOptions(themeRef.current, 'view', 500, true),
        );
        networkRef.current = network;

        network.on('click', (params) => {
            if (params.nodes.length === 0) return;
            const clickedId = params.nodes[0];

            if (isGroupNodeId(clickedId)) {
                onGroupSelectRef.current?.(groupIdFromNodeId(String(clickedId)));
                return;
            }

            if (typeof clickedId === 'number') {
                onNodeClickRef.current?.(clickedId);
                focusNodeById(clickedId, false);
                localStorage.setItem('lastFocusedNodeId', clickedId.toString());
            }
        });

        window.__focusGraphNode = (id: number) => {
            activeNodeIdRef.current = id;
            focusNodeById(id, false);
        };
        window.__fitGraphView = () => fitView();

        return () => {
            window.__focusGraphNode = undefined;
            window.__fitGraphView = undefined;
            network.destroy();
            networkRef.current = null;
            nodesDS.current = null;
            edgesDS.current = null;
        };
    }, [fitView, focusNodeById]);

    // Перше завантаження даних
    useEffect(() => {
        if (!networkRef.current || !payload) return;
        applyView(viewScopeRef.current, selectedGroupIdRef.current, false);
    }, [payload, applyView]);

    // Перемикання групи / scope — лише оновлення DataSet
    useEffect(() => {
        if (!networkRef.current || !payload) return;
        applyView(viewScope, selectedGroupId);

        if (
            viewScope === 'topics' &&
            activeNodeIdRef.current != null &&
            selectedGroupId &&
            payload.nodes.some(
                (n) => n.id === activeNodeIdRef.current && n.groupId === selectedGroupId,
            )
        ) {
            requestAnimationFrame(() => focusNodeById(activeNodeIdRef.current!, false));
        }
    }, [viewScope, selectedGroupId, payload, applyView, focusNodeById]);

    // Підсвітка обраної теми
    useEffect(() => {
        if (viewScope !== 'topics' || !nodesDS.current || !payload) return;

        const visibleNodes = selectedGroupId
            ? payload.nodes.filter((n) => n.groupId === selectedGroupId)
            : [];

        if (activeNodeId != null) {
            patchTopicHighlight(
                nodesDS.current,
                visibleNodes,
                activeNodeId,
                prevActiveNodeIdRef.current,
            );
            prevActiveNodeIdRef.current = activeNodeId;
            focusNodeById(activeNodeId, false);
        }
    }, [activeNodeId, viewScope, selectedGroupId, payload, focusNodeById]);

    useEffect(() => {
        if (!networkRef.current) return;
        networkRef.current.setOptions(
            buildViewGraphOptions(
                theme,
                'view',
                payload?.nodes.length ?? 0,
                viewScope === 'groups',
            ),
        );
    }, [theme, viewScope, payload?.nodes.length]);

    useEffect(() => {
        const el = shellRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => networkRef.current?.redraw());
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const selectedGroup = payload?.groups.find((g) => g.id === selectedGroupId) ?? null;

    return (
        <div ref={shellRef} className="absolute inset-0 graph-map-shell overflow-hidden rounded-lg">
            <div ref={containerRef} className="absolute inset-0 z-0" />
            <GraphMapHUD
                viewScope={viewScope}
                groupTitle={selectedGroup?.title ?? null}
                activeNodeTitle={activeNodeTitle}
                onFit={() => fitView()}
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
