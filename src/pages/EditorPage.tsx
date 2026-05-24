import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import Graph from '../components/Graph/Graph';
import SidebarNodes from '../components/SidebarNodes/SidebarNodes';
import type { NodeData, EdgeData } from '../components/Graph/Graph';
import { nodesApi } from '../api/nodes';
import { useAuth } from '../context/AuthContext';

export default function EditorPage() {
    const { user, role, loading: authLoading } = useAuth();
    const [nodes, setNodes] = useState<(NodeData & { level: number })[]>([]);
    const [edges, setEdges] = useState<EdgeData[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
    const [showSidebar, setShowSidebar] = useState(true);

    const isEditor = role === 'admin' || role === 'teacher';

    useEffect(() => {
        if (!user || !isEditor) {
            setLoading(false);
            return;
        }

        nodesApi
            .getGraph()
            .then((data) => {
                const formattedNodes = data.nodes.map((node) => ({
                    ...node,
                    label: node.title || `Вузол ${node.id}`,
                }));
                setNodes(formattedNodes);
                setEdges(data.edges.map(({ from, to }) => ({ from, to })));
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, isEditor]);

    if (authLoading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!isEditor) {
        return (
            <div className="max-w-lg mx-auto p-12 text-center">
                <div className="glass-card p-8">
                    <p className="text-4xl mb-4">🔒</p>
                    <h1 className="font-display text-xl font-bold mb-2">Доступ обмежено</h1>
                    <p className="opacity-60 mb-6 text-sm">
                        Редактор доступний лише викладачам та адміністраторам.
                    </p>
                    <Link to="/map" className="btn btn-primary btn-sm">
                        Переглянути карту
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-57px)] bg-base-200/30">
            <div className="border-b border-base-content/10 bg-base-100/80 backdrop-blur-sm px-4 py-3">
                <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <h1 className="font-display font-bold text-lg">Редактор карт</h1>
                        <span className="badge badge-warning badge-sm">draft</span>
                        <span className="text-xs opacity-50 hidden sm:inline">
                            Карта #1 · DAG
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="hidden md:flex items-center gap-4 text-xs opacity-60 mr-2">
                            <span><strong className="text-primary">{nodes.length}</strong> вузлів</span>
                            <span><strong className="text-accent">{edges.length}</strong> ребер</span>
                            <span className="badge badge-success badge-xs gap-1">✓ DAG OK</span>
                        </div>
                        <Link to="/topics" className="btn btn-ghost btn-sm">Теми</Link>
                        <button className="btn btn-outline btn-sm" disabled title="Незабаром">
                            Валідувати
                        </button>
                        <button className="btn btn-outline btn-sm" disabled title="Незабаром">
                            Зберегти
                        </button>
                        <button className="btn btn-primary btn-sm" disabled title="Незабаром">
                            Опублікувати
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <div
                    className={`transition-all duration-300 ${showSidebar ? 'w-64' : 'w-0'} flex-shrink-0 overflow-hidden border-r border-base-content/10 bg-base-100/50`}
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

                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-4 py-2 border-b border-base-content/5 flex justify-between items-center">
                        <p className="text-xs opacity-50">
                            Клік по вузлу · перетягни для зміни позиції · подвійний клік — деталі
                        </p>
                        <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => setShowSidebar((p) => !p)}
                        >
                            {showSidebar ? '← Панель' : '→ Панель'}
                        </button>
                    </div>

                    <div className="flex-1 relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                Завантаження графу...
                            </div>
                        ) : (
                            <Graph
                                nodes={nodes}
                                edges={edges}
                                mode="edit"
                                onNodeClick={(id) => setActiveNodeId(id)}
                                activeNodeId={activeNodeId}
                            />
                        )}
                    </div>
                </div>

                <aside className="hidden xl:block w-56 border-l border-base-content/10 bg-base-100/50 p-4 shrink-0">
                    <p className="text-[10px] uppercase tracking-widest opacity-40 mb-4 font-display font-semibold">
                        Статистика
                    </p>
                    <div className="space-y-3 text-sm">
                        <StatRow label="Вузлів" value={String(nodes.length)} />
                        <StatRow label="Ребер" value={String(edges.length)} />
                        <StatRow label="Статус" value="Чернетка" accent />
                        <StatRow label="Валідація" value="DAG ✓" success />
                    </div>
                    <div className="mt-6 pt-4 border-t border-base-content/10">
                        <p className="text-xs opacity-50 leading-relaxed">
                            Повний bulk-save, версіонування та publish — через API{' '}
                            <code className="text-primary text-[10px]">/knowledge-maps</code>
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function StatRow({
    label,
    value,
    accent,
    success,
}: {
    label: string;
    value: string;
    accent?: boolean;
    success?: boolean;
}) {
    return (
        <div className="flex justify-between items-center">
            <span className="opacity-50 text-xs">{label}</span>
            <span
                className={`font-display font-bold text-sm ${
                    success ? 'text-success' : accent ? 'text-warning' : ''
                }`}
            >
                {value}
            </span>
        </div>
    );
}
