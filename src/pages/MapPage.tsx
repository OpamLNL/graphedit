import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Graph, {
    type GraphPayload,
    type GraphViewScope,
    type NodeData,
    type EdgeData,
    type GroupData,
    type GroupEdgeData,
} from '../components/Graph/Graph';
import MapPageHeader from '../components/MapPage/MapPageHeader';
import MapGroupsOverview from '../components/MapPage/MapGroupsOverview';
import NodeInfoPanel from '../components/NodeInfoPanel/NodeInfoPanel';
import { nodesApi, type GroupNodesResponse, type MapOverviewResponse } from '../api/nodes';
import { graphEditMapsApi, type GraphEditMap } from '../api/graphEditMaps';
import { type ProgressSummary } from '../api/progress';
import { useAuth } from '../context/AuthContext';
import type { Topic } from '../api/topics';
import { mergeGroupLayouts } from '../utils/groupGraph';
import {
    applyStoredNavigation,
    navigationStorageKey,
    saveStoredNavigation,
} from '../utils/graphNavigationStorage';

function buildOverviewPayload(overview: MapOverviewResponse): GraphPayload {
    const layoutOverrides: Record<string, { x: number; y: number }> = {};
    for (const g of overview.groups) {
        if (g.x != null && g.y != null) {
            layoutOverrides[g.id] = { x: Math.round(g.x), y: Math.round(g.y) };
        }
    }
    for (const [id, pos] of Object.entries(overview.groupLayout ?? {})) {
        layoutOverrides[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }

    let groups: GroupData[] = overview.groups;
    if (Object.keys(layoutOverrides).length > 0) {
        groups = mergeGroupLayouts(groups, layoutOverrides);
    }

    const groupEdges: GroupEdgeData[] = overview.groupEdges.map((e) => ({
        from: e.from,
        to: e.to,
        type: e.type,
    }));

    return { nodes: [], edges: [], groups, groupEdges };
}

function groupResponseToPayload(data: GroupNodesResponse): { nodes: NodeData[]; edges: EdgeData[] } {
    const nodes: NodeData[] = data.nodes.map((node) => ({
        ...node,
        label: node.title || `Вузол ${node.id}`,
    }));
    const edges: EdgeData[] = data.edges.map(({ from, to }) => ({ from, to }));
    return { nodes, edges };
}

export default function MapPage() {
    const { mapId: mapIdParam } = useParams<{ mapId: string }>();
    const mapId = Number(mapIdParam);
    const { user, loading: authLoading, role } = useAuth();
    const isEditor = role === 'admin' || role === 'teacher';

    const [mapMeta, setMapMeta] = useState<GraphEditMap | null>(null);
    const [overview, setOverview] = useState<MapOverviewResponse | null>(null);
    const [graphPayload, setGraphPayload] = useState<GraphPayload | null>(null);
    const [progressSummary, setProgressSummary] = useState<ProgressSummary | null>(null);
    const [loadingOverview, setLoadingOverview] = useState(true);
    const [loadingGroup, setLoadingGroup] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
    const [refresh, setRefresh] = useState(0);

    const [viewScope, setViewScope] = useState<GraphViewScope>('groups');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [topicsById, setTopicsById] = useState<Map<number, Topic>>(new Map());
    const [searchQuery, setSearchQuery] = useState('');
    const navReadyRef = useRef(false);
    const groupCacheRef = useRef<Map<string, GroupNodesResponse>>(new Map());
    const pendingFocusNodeRef = useRef<number | null>(null);

    const loadOverview = useCallback(async () => {
        const [meta, overviewData] = await Promise.all([
            graphEditMapsApi.getOne(mapId),
            nodesApi.getMapOverview(mapId),
        ]);

        if (!isEditor && meta.status !== 'published') {
            throw new Error('UNPUBLISHED');
        }

        groupCacheRef.current.clear();
        setMapMeta(meta);
        setOverview(overviewData);
        setProgressSummary({
            ...overviewData.progress,
            nodes: overviewData.nodesIndex.map((n) => ({
                id: n.id,
                title: n.title,
                topicId: n.topicId ?? 0,
                status: n.status,
                level: 0,
                progress: n.status === 'completed' ? 1 : 0,
            })),
        });
        setGraphPayload(buildOverviewPayload(overviewData));

        return overviewData;
    }, [mapId, isEditor]);

    const loadGroupIntoPayload = useCallback(
        async (groupId: string, force = false) => {
            let cached = groupCacheRef.current.get(groupId);
            if (!cached || force) {
                setLoadingGroup(true);
                try {
                    cached = await nodesApi.getGroupNodes(mapId, groupId);
                    groupCacheRef.current.set(groupId, cached);
                } finally {
                    setLoadingGroup(false);
                }
            }

            const { nodes, edges } = groupResponseToPayload(cached);
            setTopicsById((prev) => {
                const next = new Map(prev);
                for (const t of cached!.topics) {
                    next.set(t.id, t);
                }
                return next;
            });

            setGraphPayload((prev) => {
                if (!prev) return prev;
                return { ...prev, nodes, edges };
            });

            return cached;
        },
        [mapId],
    );

    useEffect(() => {
        if (!user || !mapId || Number.isNaN(mapId)) {
            setLoadingOverview(false);
            return;
        }

        let cancelled = false;
        setLoadingOverview(true);
        setLoadError(null);

        loadOverview()
            .then((overviewData) => {
                if (cancelled) return;
                if (!navReadyRef.current) {
                    navReadyRef.current = true;
                    const nav = applyStoredNavigation(
                        mapId,
                        'view',
                        overviewData.groups.map((g) => g.id),
                        overviewData.nodesIndex.map((n) => n.id),
                    );
                    setViewScope(nav.viewScope);
                    setSelectedGroupId(nav.selectedGroupId);
                    setActiveNodeId(nav.activeNodeId);
                    pendingFocusNodeRef.current = nav.activeNodeId;
                }
            })
            .catch((e) => {
                if (cancelled) return;
                if (e instanceof Error && e.message === 'UNPUBLISHED') {
                    setLoadError('Ця карта ще не опублікована.');
                    return;
                }
                console.error(e);
                setLoadError('Не вдалося завантажити карту.');
            })
            .finally(() => {
                if (!cancelled) setLoadingOverview(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user, mapId, refresh, loadOverview, loadGroupIntoPayload]);

    useEffect(() => {
        if (loadingOverview || viewScope !== 'topics' || !selectedGroupId) return;
        void loadGroupIntoPayload(selectedGroupId).then(() => {
            if (pendingFocusNodeRef.current != null) {
                const nodeId = pendingFocusNodeRef.current;
                pendingFocusNodeRef.current = null;
                setTimeout(() => window.__focusGraphNode?.(nodeId), 300);
            }
        });
    }, [loadingOverview, viewScope, selectedGroupId, loadGroupIntoPayload]);

    useEffect(() => {
        if (!mapId || Number.isNaN(mapId) || loadingOverview || !navReadyRef.current) return;
        saveStoredNavigation(navigationStorageKey(mapId, 'view'), {
            viewScope,
            selectedGroupId,
            activeNodeId,
        });
    }, [mapId, loadingOverview, viewScope, selectedGroupId, activeNodeId]);

    useEffect(() => {
        navReadyRef.current = false;
        groupCacheRef.current.clear();
    }, [mapId]);

    const groups = graphPayload?.groups ?? [];
    const nodes = graphPayload?.nodes ?? [];

    const selectedGroup = useMemo(
        () => groups.find((g) => g.id === selectedGroupId) ?? null,
        [groups, selectedGroupId],
    );

    const activeNode = useMemo(
        () => (activeNodeId != null ? nodes.find((n) => n.id === activeNodeId) ?? null : null),
        [nodes, activeNodeId],
    );

    const activeTopic = useMemo(
        () =>
            activeNode && activeNode.topicId != null
                ? topicsById.get(activeNode.topicId) ?? null
                : null,
        [activeNode, topicsById],
    );

    const searchResults = useMemo((): NodeData[] => {
        const q = searchQuery.trim().toLowerCase();
        if (!q || !overview) return [];
        return overview.nodesIndex
            .filter((n) => n.title.toLowerCase().includes(q))
            .slice(0, 8)
            .map((n) => ({
                id: n.id,
                title: n.title,
                label: n.title,
                topicId: n.topicId,
                groupId: n.groupId,
                status: n.status,
                level: 0,
                progress: n.status === 'completed' ? 1 : 0,
                x: null,
                y: null,
                globalOrder: null,
                orderInGroup: 0,
            }));
    }, [searchQuery, overview]);

    const handleSelectGroup = (groupId: string) => {
        setSelectedGroupId(groupId);
        setViewScope('topics');
        setActiveNodeId(null);
    };

    const handleBackToGroups = () => {
        setViewScope('groups');
        setSelectedGroupId(null);
        setActiveNodeId(null);
        setGraphPayload((prev) => (prev ? { ...prev, nodes: [], edges: [] } : prev));
    };

    const handleSelectNode = (id: number) => {
        const node = nodes.find((n) => n.id === id);
        if (node?.groupId && node.groupId !== selectedGroupId) {
            setSelectedGroupId(node.groupId);
            setViewScope('topics');
        }
        setActiveNodeId(id);
    };

    const handleSearchPick = async (node: NodeData) => {
        if (node.groupId) {
            setSelectedGroupId(node.groupId);
            setViewScope('topics');
            await loadGroupIntoPayload(node.groupId);
        }
        setActiveNodeId(node.id);
        setSearchQuery('');
        setTimeout(() => window.__focusGraphNode?.(node.id), 150);
    };

    const handleProgressUpdate = async () => {
        if (!mapId || Number.isNaN(mapId)) return;
        try {
            const overviewData = await loadOverview();
            if (viewScope === 'topics' && selectedGroupId) {
                await loadGroupIntoPayload(selectedGroupId, true);
            } else {
                setGraphPayload(buildOverviewPayload(overviewData));
            }
        } catch (e) {
            console.error(e);
            setRefresh((r) => r + 1);
        }
    };

    const loading = loadingOverview || (viewScope === 'topics' && loadingGroup && nodes.length === 0);

    if (authLoading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return (
            <div className="max-w-lg mx-auto p-8 text-center">
                <p className="mb-4">Увійди, щоб переглянути карту знань</p>
                <Link to="/login" className="btn btn-primary">
                    Увійти через Google
                </Link>
            </div>
        );
    }

    if (!mapId || Number.isNaN(mapId)) {
        return <Navigate to="/maps" replace />;
    }

    if (loadError) {
        return (
            <div className="max-w-lg mx-auto p-8 text-center space-y-4">
                <p className="text-error">{loadError}</p>
                <Link to="/maps" className="btn btn-primary">
                    ← До списку карт
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-64px)] bg-base-200/30">
            <MapPageHeader
                mapMeta={mapMeta}
                mapId={mapId}
                groups={groups}
                nodes={nodes}
                viewScope={viewScope}
                selectedGroupId={selectedGroupId}
                selectedGroupTitle={selectedGroup?.title ?? null}
                progress={progressSummary}
                searchQuery={searchQuery}
                searchResults={searchResults}
                isEditor={isEditor}
                onBackToGroups={handleBackToGroups}
                onSelectGroup={handleSelectGroup}
                onSearchChange={setSearchQuery}
                onSearchPick={(node) => void handleSearchPick(node)}
            />

            <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                    {viewScope === 'groups' && !loadingOverview && (
                        <MapGroupsOverview groups={groups} onSelectGroup={handleSelectGroup} />
                    )}
                    <div className="flex-1 relative min-h-[320px]">
                        {loadingOverview ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                Завантаження карти...
                            </div>
                        ) : loading ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                Завантаження групи...
                            </div>
                        ) : (
                            <Graph
                                payload={graphPayload}
                                viewScope={viewScope}
                                selectedGroupId={selectedGroupId}
                                onGroupSelect={handleSelectGroup}
                                onNodeClick={handleSelectNode}
                                onBackToGroups={handleBackToGroups}
                                activeNodeId={activeNodeId}
                                activeNodeTitle={
                                    nodes.find((n) => n.id === activeNodeId)?.title ?? null
                                }
                                viewportStorageId={mapId}
                            />
                        )}
                    </div>
                </div>

                <aside className="hidden lg:flex w-80 shrink-0 border-l border-base-content/10 bg-base-100/90 flex-col min-h-0">
                    <div className="p-3 border-b border-base-content/10">
                        <p className="text-[10px] uppercase tracking-widest opacity-40 font-display font-semibold">
                            {activeNode ? 'Тема' : 'Обери вузол'}
                        </p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <NodeInfoPanel
                            node={activeNode}
                            topic={activeTopic}
                            mapId={mapId}
                            onProgressUpdate={() => void handleProgressUpdate()}
                            embedded
                        />
                    </div>
                </aside>
            </div>

            <div className="lg:hidden border-t border-base-content/10 bg-base-100/95 max-h-[min(42vh,360px)] overflow-y-auto">
                <NodeInfoPanel
                    node={activeNode}
                    topic={activeTopic}
                    mapId={mapId}
                    onProgressUpdate={() => void handleProgressUpdate()}
                    embedded
                />
            </div>
        </div>
    );
}
