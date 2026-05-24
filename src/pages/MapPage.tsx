import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Graph from '../components/Graph/Graph';
import SidebarNodes from '../components/SidebarNodes/SidebarNodes';
import type { NodeData, EdgeData } from '../components/Graph/Graph';
import NodeInfoPanel from '../components/NodeInfoPanel/NodeInfoPanel';
import { nodesApi } from '../api/nodes';
import { knowledgeMapsApi, type KnowledgeMap } from '../api/knowledgeMaps';
import { useAuth } from '../context/AuthContext';

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

                const lastId = localStorage.getItem('lastFocusedNodeId');
                if (lastId) {
                    setTimeout(() => {
                        window.__focusGraphNode?.(Number(lastId));
                    }, 300);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, mapId, refresh]);

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
                    onSidebarNodeClick={(id) => {
                        setActiveNodeId(id);
                        window.__focusGraphNode?.(id);
                    }}
                />
            </div>

            <div className="flex-1 flex flex-col">
                <div className="px-4 py-3 border-b border-base-content/10 flex justify-between items-center bg-base-100/50">
                    <div>
                        <div className="flex items-center gap-2">
                            <Link to="/maps" className="btn btn-ghost btn-xs">← Карти</Link>
                            <h1 className="text-lg font-bold">{mapMeta?.title ?? 'Карта знань'}</h1>
                            {mapMeta?.status === 'published' && (
                                <span className="badge badge-success badge-xs">published</span>
                            )}
                        </div>
                        <p className="text-xs opacity-60 mt-0.5">Натисни на вузол для деталей та прогресу</p>
                    </div>
                    <button className="btn btn-sm btn-outline" onClick={() => setShowSidebar((p) => !p)}>
                        {showSidebar ? '← Сховати' : '→ Панель'}
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                Завантаження графу...
                            </div>
                        ) : (
                            <Graph
                                nodes={nodes}
                                edges={edges}
                                onNodeClick={(id) => setActiveNodeId(id)}
                                activeNodeId={activeNodeId}
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
