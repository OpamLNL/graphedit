import { useEffect, useMemo, useRef, useState } from 'react';
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
import { nodesApi } from '../api/nodes';
import { topicsApi, type Topic } from '../api/topics';
import { knowledgeMapsApi, type KnowledgeMap } from '../api/knowledgeMaps';
import { progressApi, type ProgressSummary } from '../api/progress';
import { useAuth } from '../context/AuthContext';
import {
    deriveGroupEdgesFromNodes,
    deriveGroupsFromNodes,
    filterGroupEdgesForGroups,
    filterGroupsForMap,
    mergeGroupLayouts,
} from '../utils/groupGraph';
import {
    applyStoredNavigation,
    navigationStorageKey,
    saveStoredNavigation,
} from '../utils/graphNavigationStorage';

export default function MapPage() {
    const { mapId: mapIdParam } = useParams<{ mapId: string }>();
    const mapId = Number(mapIdParam);
    const { user, loading: authLoading, role } = useAuth();
    const isEditor = role === 'admin' || role === 'teacher';

    const [mapMeta, setMapMeta] = useState<KnowledgeMap | null>(null);
    const [graphPayload, setGraphPayload] = useState<GraphPayload | null>(null);
    const [progressSummary, setProgressSummary] = useState<ProgressSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
    const [refresh, setRefresh] = useState(0);

    const [viewScope, setViewScope] = useState<GraphViewScope>('groups');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [topicsById, setTopicsById] = useState<Map<number, Topic>>(new Map());
    const [searchQuery, setSearchQuery] = useState('');
    const navReadyRef = useRef(false);

    useEffect(() => {
        if (!user || !mapId || Number.isNaN(mapId)) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setLoadError(null);

        Promise.all([
            knowledgeMapsApi.getOne(mapId),
            nodesApi.getGraph(mapId),
            nodesApi.getGroupGraph(mapId).catch(() => null),
            topicsApi.getAll().catch(() => []),
            progressApi.getMySummary(mapId).catch(() => null),
        ])
            .then(([meta, data, groupMeta, topics, progress]) => {
                if (cancelled) return;

                if (!isEditor && meta.status !== 'published') {
                    setLoadError('Ця карта ще не опублікована.');
                    return;
                }

                setMapMeta(meta);
                setProgressSummary(progress);
                setTopicsById(new Map(topics.map((t) => [t.id, t])));

                const topicById = new Map(topics.map((t) => [t.id, t]));

                const nodes: NodeData[] = data.nodes.map((node) => {
                    const topic =
                        node.topicId != null ? topicById.get(node.topicId) : undefined;
                    return {
                        ...node,
                        label: node.title || `Вузол ${node.id}`,
                        groupId: node.groupId ?? topic?.groupId ?? null,
                        orderInGroup: node.orderInGroup ?? topic?.orderInGroup ?? 0,
                    };
                });

                const edges: EdgeData[] = data.edges.map(({ from, to }) => ({ from, to }));

                let groups: GroupData[] =
                    data.groups?.length ? data.groups : (groupMeta?.groups ?? []);
                let groupEdges: GroupEdgeData[] = (
                    data.groupEdges?.length ? data.groupEdges : (groupMeta?.groupEdges ?? [])
                ).map((e) => ({
                    from: e.from,
                    to: e.to,
                    type: e.type,
                }));

                const layoutOverrides: Record<string, { x: number; y: number }> = {};
                for (const g of groups) {
                    if (g.x != null && g.y != null) {
                        layoutOverrides[g.id] = { x: Math.round(g.x), y: Math.round(g.y) };
                    }
                }
                for (const [id, pos] of Object.entries(groupMeta?.groupLayout ?? {})) {
                    layoutOverrides[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };
                }
                if (Object.keys(layoutOverrides).length > 0) {
                    groups = mergeGroupLayouts(groups, layoutOverrides);
                }

                if (groups.length === 0 && nodes.some((n) => n.groupId)) {
                    groups = deriveGroupsFromNodes(nodes);
                    groupEdges = deriveGroupEdgesFromNodes(nodes, edges);
                } else if (groups.length > 0) {
                    groups = filterGroupsForMap(
                        groups,
                        groupEdges.map((e) => ({ ...e, id: undefined })),
                        nodes.map((n) => n.groupId),
                    );
                    const visibleIds = new Set(groups.map((g) => g.id));
                    groupEdges = filterGroupEdgesForGroups(
                        groupEdges.map((e) => ({ ...e, id: undefined })),
                        visibleIds,
                    );
                }

                setGraphPayload({ nodes, edges, groups, groupEdges });

                if (!navReadyRef.current) {
                    navReadyRef.current = true;
                    const nav = applyStoredNavigation(
                        mapId,
                        'view',
                        groups.map((g) => g.id),
                        nodes.map((n) => n.id),
                    );
                    setViewScope(nav.viewScope);
                    setSelectedGroupId(nav.selectedGroupId);
                    setActiveNodeId(nav.activeNodeId);
                    if (nav.activeNodeId != null && nav.viewScope === 'topics') {
                        setTimeout(() => window.__focusGraphNode?.(nav.activeNodeId!), 300);
                    }
                }
            })
            .catch((e) => {
                if (cancelled) return;
                console.error(e);
                setLoadError('Не вдалося завантажити карту.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user, mapId, refresh, isEditor]);

    useEffect(() => {
        if (!mapId || Number.isNaN(mapId) || loading || !navReadyRef.current) return;
        saveStoredNavigation(navigationStorageKey(mapId, 'view'), {
            viewScope,
            selectedGroupId,
            activeNodeId,
        });
    }, [mapId, loading, viewScope, selectedGroupId, activeNodeId]);

    useEffect(() => {
        navReadyRef.current = false;
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

    const searchResults = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return [];
        return nodes
            .filter((n) => n.title.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
            .slice(0, 8);
    }, [nodes, searchQuery]);

    const handleSelectGroup = (groupId: string) => {
        setSelectedGroupId(groupId);
        setViewScope('topics');
        setActiveNodeId(null);
    };

    const handleBackToGroups = () => {
        setViewScope('groups');
        setSelectedGroupId(null);
        setActiveNodeId(null);
    };

    const handleSelectNode = (id: number) => {
        const node = nodes.find((n) => n.id === id);
        if (node?.groupId && node.groupId !== selectedGroupId) {
            setSelectedGroupId(node.groupId);
            setViewScope('topics');
        }
        setActiveNodeId(id);
    };

    const handleSearchPick = (node: NodeData) => {
        if (node.groupId) {
            setSelectedGroupId(node.groupId);
            setViewScope('topics');
        }
        setActiveNodeId(node.id);
        setSearchQuery('');
        setTimeout(() => window.__focusGraphNode?.(node.id), 150);
    };

    const handleProgressUpdate = () => {
        if (!mapId || Number.isNaN(mapId)) return;
        progressApi
            .getMySummary(mapId)
            .then(setProgressSummary)
            .catch(console.error);
        setRefresh((r) => r + 1);
    };

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
                onSearchPick={handleSearchPick}
            />

            <div className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                    {viewScope === 'groups' && !loading && (
                        <MapGroupsOverview groups={groups} onSelectGroup={handleSelectGroup} />
                    )}
                    <div className="flex-1 relative min-h-[320px]">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                Завантаження графу...
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
                            onProgressUpdate={handleProgressUpdate}
                            embedded
                        />
                    </div>
                </aside>
            </div>

            <div className="lg:hidden border-t border-base-content/10 bg-base-100/95 max-h-[min(42vh,360px)] overflow-y-auto">
                <NodeInfoPanel
                    node={activeNode}
                    topic={activeTopic}
                    onProgressUpdate={handleProgressUpdate}
                    embedded
                />
            </div>
        </div>
    );
}
