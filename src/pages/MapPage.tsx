import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Graph from '../components/Graph/Graph';
import SidebarNodes from '../components/SidebarNodes/SidebarNodes';
import type { NodeData, EdgeData } from '../components/Graph/Graph';
import NodeInfoPanel from '../components/NodeInfoPanel/NodeInfoPanel';
import { nodesApi } from '../api/nodes';
import { knowledgeMapsApi, type KnowledgeMap } from '../api/knowledgeMaps';
import { useAuth } from '../context/AuthContext';
import {
    filterGraphForView,
    getLevelRange,
    searchNodes,
    countByLevel,
    type MapViewMode,
} from '../utils/graphFilters';
import type { ZoomDisplayMode } from '../utils/semanticZoom';

export default function MapPage() {
    const { mapId: mapIdParam } = useParams<{ mapId: string }>();
    const mapId = Number(mapIdParam);
    const { user, loading: authLoading } = useAuth();
    const [mapMeta, setMapMeta] = useState<KnowledgeMap | null>(null);
    const [nodes, setNodes] = useState<(NodeData & { level: number })[]>([]);
    const [edges, setEdges] = useState<EdgeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
    const [refresh, setRefresh] = useState(0);
    const [showSidebar, setShowSidebar] = useState(true);

    const [viewMode, setViewMode] = useState<MapViewMode>('overview');
    const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [zoomDisplay, setZoomDisplay] = useState<ZoomDisplayMode>('super');

    useEffect(() => {
        if (!user || !mapId || Number.isNaN(mapId)) {
            setLoading(false);
            return;
        }

        setLoading(true);
        Promise.all([
            knowledgeMapsApi.getOne(mapId),
            nodesApi.getGraph(mapId),
        ])
            .then(([meta, data]) => {
                setMapMeta(meta);
                const formattedNodes = data.nodes.map((node) => ({
                    ...node,
                    label: node.title || `Вузол ${node.id}`,
                }));
                setNodes(formattedNodes);
                setEdges(data.edges.map(({ from, to }) => ({ from, to })));

                const levels = getLevelRange(formattedNodes);
                if (levels.length > 0) {
                    const firstAvailable = formattedNodes.find((n) => n.status === 'available');
                    setSelectedLevel(firstAvailable?.level ?? levels[0]);
                }

                const lastId = localStorage.getItem('lastFocusedNodeId');
                if (lastId) {
                    setTimeout(() => {
                        window.__focusGraphNode?.(Number(lastId));
                    }, 500);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, mapId, refresh]);

    const levels = useMemo(() => getLevelRange(nodes), [nodes]);
    const levelCounts = useMemo(() => countByLevel(nodes), [nodes]);

    const visibleGraph = useMemo(
        () =>
            filterGraphForView(nodes, edges, viewMode, selectedLevel, activeNodeId),
        [nodes, edges, viewMode, selectedLevel, activeNodeId],
    );

    const searchResults = useMemo(
        () => searchNodes(nodes, searchQuery).slice(0, 8),
        [nodes, searchQuery],
    );

    const handleSelectNode = (id: number) => {
        setActiveNodeId(id);
        localStorage.setItem('lastFocusedNodeId', id.toString());
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
        <div className="flex min-h-[calc(100vh-64px)]">
            <div
                className={`transition-all duration-300 ${showSidebar ? 'w-64' : 'w-0'} flex-shrink-0 overflow-hidden border-r border-base-content/10`}
            >
                <SidebarNodes
                    nodes={nodes}
                    activeNodeId={activeNodeId}
                    onSidebarNodeClick={handleSelectNode}
                    highlightLevel={viewMode === 'level' ? selectedLevel : null}
                />
            </div>

            <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-3 border-b border-base-content/10 bg-base-100/50 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Link to="/maps" className="btn btn-ghost btn-xs">← Карти</Link>
                            <h1 className="text-lg font-bold">{mapMeta?.title ?? 'Карта знань'}</h1>
                            <span className="badge badge-ghost badge-xs opacity-60">
                                {nodes.length} вузлів · {levels.length} рівнів
                            </span>
                            {viewMode === 'overview' && nodes.length > 80 && (
                                <span className={`badge badge-xs ${zoomDisplay === 'super' ? 'badge-primary' : 'badge-ghost'}`}>
                                    {zoomDisplay === 'super' ? '🗺️ рівні' : '🔍 деталі'}
                                </span>
                            )}
                        </div>
                        <button className="btn btn-sm btn-outline" onClick={() => setShowSidebar((p) => !p)}>
                            {showSidebar ? '← Сховати' : '→ Панель'}
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="join join-horizontal">
                            {(['overview', 'level', 'focus'] as MapViewMode[]).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    className={`join-item btn btn-xs ${viewMode === m ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setViewMode(m)}
                                >
                                    {m === 'overview' ? 'Огляд' : m === 'level' ? 'По рівню' : 'Фокус'}
                                </button>
                            ))}
                        </div>

                        {viewMode === 'level' && (
                            <div className="flex flex-wrap gap-1 max-w-md overflow-x-auto">
                                {levels.map((lv) => (
                                    <button
                                        key={lv}
                                        type="button"
                                        className={`btn btn-xs ${
                                            selectedLevel === lv ? 'btn-secondary' : 'btn-ghost'
                                        }`}
                                        onClick={() => setSelectedLevel(lv)}
                                        title={`${levelCounts[lv] ?? 0} тем`}
                                    >
                                        L{lv}
                                    </button>
                                ))}
                            </div>
                        )}

                        {viewMode === 'focus' && (
                            <span className="text-xs opacity-50">
                                {activeNodeId
                                    ? `«${nodes.find((n) => n.id === activeNodeId)?.title}»`
                                    : 'обери вузол'}
                            </span>
                        )}

                        <div className="relative ml-auto">
                            <input
                                type="search"
                                placeholder="Пошук теми..."
                                className="input input-xs input-bordered w-40 sm:w-52"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && searchResults.length > 0 && (
                                <ul className="absolute top-full right-0 mt-1 z-20 menu bg-base-100 rounded-box shadow-lg border border-base-content/10 w-56 p-1">
                                    {searchResults.map((n) => (
                                        <li key={n.id}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleSelectNode(n.id);
                                                    setSearchQuery('');
                                                    setViewMode('focus');
                                                }}
                                            >
                                                <span className="truncate">{n.title}</span>
                                                <span className="badge badge-xs opacity-50">L{n.level}</span>
                                            </button>
                                        </li>
                                    ))}
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

                    <p className="text-[10px] opacity-40">
                        {viewMode === 'overview' && zoomDisplay === 'super' &&
                            'Semantic zoom: рівні як супервузли. Наблизь (scroll+) — розкриються теми. Клік по рівню — перехід до нього.'}
                        {viewMode === 'overview' && zoomDisplay === 'detail' &&
                            'Детальний вигляд. Віддалити (scroll−) — знову згрупуються в рівні.'}
                        {viewMode === 'level' &&
                            `Рівень ${selectedLevel}: ${levelCounts[selectedLevel ?? 0] ?? 0} тем + сусідні зв'язки`}
                        {viewMode === 'focus' && 'Вузол + предки/нащадки (±2 кроки)'}
                        {' · '}
                        <span className="text-success">●</span> доступно
                        <span className="text-info ml-2">●</span> завершено
                        <span className="opacity-50 ml-2">●</span> locked
                    </p>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                Завантаження графу...
                            </div>
                        ) : (
                            <Graph
                                key={`${viewMode}-${selectedLevel}`}
                                nodes={viewMode === 'overview' ? nodes : visibleGraph.nodes}
                                edges={viewMode === 'overview' ? edges : visibleGraph.edges}
                                onNodeClick={handleSelectNode}
                                activeNodeId={activeNodeId}
                                semanticZoom={viewMode === 'overview' && nodes.length > 80}
                                onZoomModeChange={setZoomDisplay}
                                onLevelFocus={(level) => setSelectedLevel(level)}
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
        </div>
    );
}
