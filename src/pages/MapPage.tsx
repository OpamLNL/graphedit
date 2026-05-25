import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Graph, {
    type GraphPayload,
    type GraphViewScope,
    type NodeData,
    type EdgeData,
    type GroupData,
    type GroupEdgeData,
} from '../components/Graph/Graph';
import NodeInfoPanel from '../components/NodeInfoPanel/NodeInfoPanel';
import { nodesApi } from '../api/nodes';
import { topicsApi } from '../api/topics';
import { knowledgeMapsApi, type KnowledgeMap } from '../api/knowledgeMaps';
import { useAuth } from '../context/AuthContext';
import {
    deriveGroupEdgesFromNodes,
    deriveGroupsFromNodes,
} from '../utils/groupGraph';

export default function MapPage() {
    const { mapId: mapIdParam } = useParams<{ mapId: string }>();
    const mapId = Number(mapIdParam);
    const { user, loading: authLoading } = useAuth();

    const [mapMeta, setMapMeta] = useState<KnowledgeMap | null>(null);
    const [graphPayload, setGraphPayload] = useState<GraphPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
    const [refresh, setRefresh] = useState(0);

    const [viewScope, setViewScope] = useState<GraphViewScope>('groups');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!user || !mapId || Number.isNaN(mapId)) {
            setLoading(false);
            return;
        }

        setLoading(true);
        Promise.all([
            knowledgeMapsApi.getOne(mapId),
            nodesApi.getGraph(mapId),
            nodesApi.getGroupGraph(mapId).catch(() => null),
            topicsApi.getAll().catch(() => []),
        ])
            .then(([meta, data, groupMeta, topics]) => {
                setMapMeta(meta);

                const topicById = new Map(topics.map((t) => [t.id, t]));

                const nodes: NodeData[] = data.nodes.map((node) => {
                    const topic = topicById.get(node.topicId);
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

                if (groups.length === 0 && nodes.some((n) => n.groupId)) {
                    groups = deriveGroupsFromNodes(nodes);
                    groupEdges = deriveGroupEdgesFromNodes(nodes, edges);
                }

                setGraphPayload({ nodes, edges, groups, groupEdges });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, mapId, refresh]);

    const groups = graphPayload?.groups ?? [];
    const nodes = graphPayload?.nodes ?? [];

    const selectedGroup = useMemo(
        () => groups.find((g) => g.id === selectedGroupId) ?? null,
        [groups, selectedGroupId],
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
        localStorage.setItem('lastFocusedNodeId', id.toString());
    };

    const handleSearchPick = (node: NodeData) => {
        if (node.groupId) handleSelectGroup(node.groupId);
        setActiveNodeId(node.id);
        setSearchQuery('');
        setTimeout(() => window.__focusGraphNode?.(node.id), 150);
    };

    if (authLoading) return <div className="p-8 text-center">Завантаження...</div>;

    if (!user) {
        return (
            <div className="max-w-lg mx-auto p-8 text-center">
                <p className="mb-4">Увійди, щоб переглянути карту знань</p>
                <Link to="/login" className="btn btn-primary">Увійти через Google</Link>
            </div>
        );
    }

    if (!mapId || Number.isNaN(mapId)) {
        return <Navigate to="/maps" replace />;
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-64px)]">
            <div className="px-4 py-3 border-b border-base-content/10 bg-base-100/50 space-y-2 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                    <Link to="/maps" className="btn btn-ghost btn-xs">← Карти</Link>
                    <h1 className="text-lg font-bold">{mapMeta?.title ?? 'Карта знань'}</h1>
                    <span className="badge badge-ghost badge-xs opacity-60">
                        {groups.length} груп · {nodes.length} тем
                    </span>

                    <div className="flex items-center gap-1 text-xs opacity-70 ml-2">
                        <button
                            type="button"
                            className={`btn btn-xs ${viewScope === 'groups' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={handleBackToGroups}
                        >
                            Групи
                        </button>
                        {selectedGroup && (
                            <>
                                <span>/</span>
                                <span className="font-medium truncate max-w-[200px]" title={selectedGroup.title}>
                                    {selectedGroup.title}
                                </span>
                            </>
                        )}
                    </div>

                    <div className="relative ml-auto">
                        <input
                            type="search"
                            placeholder="Пошук теми..."
                            className="input input-xs input-bordered w-44 sm:w-56"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && searchResults.length > 0 && (
                            <ul className="absolute top-full right-0 mt-1 z-30 menu bg-base-100 rounded-box shadow-lg border border-base-content/10 w-64 p-1">
                                {searchResults.map((n) => {
                                    const g = groups.find((gr) => gr.id === n.groupId);
                                    return (
                                        <li key={n.id}>
                                            <button type="button" onClick={() => handleSearchPick(n)}>
                                                <span className="truncate">{n.title}</span>
                                                <span className="badge badge-xs opacity-50 shrink-0">
                                                    {g?.title?.slice(0, 12) ?? '?'}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => window.__fitGraphView?.()}
                    >
                        ⊞ Fit
                    </button>
                </div>

                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {groups.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            title={`${g.topicCount} тем · ${g.progressPercent}%`}
                            className={`btn btn-xs shrink-0 ${
                                selectedGroupId === g.id && viewScope === 'topics'
                                    ? 'btn-secondary'
                                    : g.availableCount > 0
                                      ? 'btn-ghost border border-success/30'
                                      : 'btn-ghost'
                            }`}
                            onClick={() => handleSelectGroup(g.id)}
                        >
                            {g.title}
                            <span className="opacity-40 ml-1">({g.topicCount})</span>
                        </button>
                    ))}
                </div>

                <p className="text-[10px] opacity-40">
                    {viewScope === 'groups'
                        ? 'Огляд груп зі звʼязками. Клік по групі або кнопці зверху — теми всередині.'
                        : `${selectedGroup?.topicCount ?? 0} тем у групі «${selectedGroup?.title ?? ''}»`}
                    {' · '}
                    <span className="text-warning">●</span> обрано
                    <span className="text-success ml-2">●</span> доступно
                    <span className="text-info ml-2">●</span> завершено
                    <span className="opacity-50 ml-2">●</span> locked
                </p>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 relative min-h-0">
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
                        />
                    )}
                </div>

                <NodeInfoPanel
                    key={`${activeNodeId}-${refresh}`}
                    node={nodes.find((n) => n.id === activeNodeId) || null}
                    onProgressUpdate={() => setRefresh((r) => r + 1)}
                />
            </div>
        </div>
    );
}
