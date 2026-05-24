import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import FlowCanvas, { type FlowCanvasHandle } from '../components/FlowEditor/FlowCanvas';
import { flowToBulkSave, type KnowledgeNodeData } from '../components/FlowEditor/layoutUtils';
import {
    knowledgeMapsApi,
    type EditorGraphResponse,
    type GraphValidationResult,
    type KnowledgeMap,
} from '../api/knowledgeMaps';
import { useAuth } from '../context/AuthContext';
import type { Node, Edge } from '@xyflow/react';

export default function EditorPage() {
    const { mapId: mapIdParam } = useParams<{ mapId: string }>();
    const mapId = Number(mapIdParam);
    const { user, role, loading: authLoading } = useAuth();

    const [map, setMap] = useState<KnowledgeMap | null>(null);
    const [graph, setGraph] = useState<EditorGraphResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
    const [validation, setValidation] = useState<GraphValidationResult | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [validating, setValidating] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [deletedNodeIds, setDeletedNodeIds] = useState<number[]>([]);
    const [deletedEdgeIds, setDeletedEdgeIds] = useState<number[]>([]);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    const canvasRef = useRef<FlowCanvasHandle>(null);
    const isEditor = role === 'admin' || role === 'teacher';

    useEffect(() => {
        if (!user || !isEditor || !mapId || Number.isNaN(mapId)) {
            setLoading(false);
            return;
        }

        setLoading(true);
        Promise.all([
            knowledgeMapsApi.getOne(mapId),
            knowledgeMapsApi.getEditorGraph(mapId),
        ])
            .then(([m, g]) => {
                setMap(m);
                setGraph(g);
                setDeletedNodeIds([]);
                setDeletedEdgeIds([]);
                setDirty(false);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, isEditor, mapId]);

    const handleValidate = async () => {
        if (!mapId) return;
        setValidating(true);
        setStatusMsg(null);
        try {
            const result = await knowledgeMapsApi.validate(mapId);
            setValidation(result);
            setStatusMsg(result.valid ? 'Граф валідний ✓' : `Помилки: ${result.errors.length}`);
        } catch (e) {
            console.error(e);
        } finally {
            setValidating(false);
        }
    };

    const handleSave = async () => {
        if (!mapId || !canvasRef.current) return;
        setSaving(true);
        setStatusMsg(null);
        try {
            const payload = flowToBulkSave(
                canvasRef.current.getNodes(),
                canvasRef.current.getEdges(),
                deletedNodeIds,
                deletedEdgeIds,
            );
            const saved = await knowledgeMapsApi.saveGraph(mapId, payload);
            setGraph(saved);
            setDeletedNodeIds([]);
            setDeletedEdgeIds([]);
            setDirty(false);
            setStatusMsg('Збережено');
        } catch (e) {
            console.error(e);
            setStatusMsg('Помилка збереження');
        } finally {
            setSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!mapId) return;
        if (dirty && !window.confirm('Є незбережені зміни. Опублікувати без збереження?')) return;
        setPublishing(true);
        try {
            const updated = await knowledgeMapsApi.publish(mapId);
            setMap(updated);
            setStatusMsg('Опубліковано');
        } catch (e) {
            console.error(e);
            setStatusMsg('Помилка публікації');
        } finally {
            setPublishing(false);
        }
    };

    const handleNodesDelete = useCallback((nodes: Node[]) => {
        const ids = nodes
            .map((n) => (n.data as KnowledgeNodeData).dbId)
            .filter((id): id is number => typeof id === 'number');
        setDeletedNodeIds((prev) => [...prev, ...ids]);
        setDirty(true);
    }, []);

    const handleEdgesDelete = useCallback((edges: Edge[]) => {
        const ids = edges
            .map((e) => e.data?.dbId as number | undefined)
            .filter((id): id is number => typeof id === 'number');
        setDeletedEdgeIds((prev) => [...prev, ...ids]);
        setDirty(true);
    }, []);

    if (authLoading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) return <Navigate to="/login" replace />;

    if (!isEditor) {
        return (
            <div className="max-w-lg mx-auto p-12 text-center">
                <div className="glass-card p-8">
                    <p className="text-4xl mb-4">🔒</p>
                    <h1 className="font-display text-xl font-bold mb-2">Доступ обмежено</h1>
                    <p className="opacity-60 mb-6 text-sm">Редактор лише для викладачів та адмінів.</p>
                    <Link to="/maps" className="btn btn-primary btn-sm">До списку карт</Link>
                </div>
            </div>
        );
    }

    if (!mapId || Number.isNaN(mapId)) {
        return <Navigate to="/maps" replace />;
    }

    const nodeCount = graph?.nodes.length ?? 0;
    const edgeCount = graph?.edges.length ?? 0;

    return (
        <div className="flex flex-col min-h-[calc(100vh-57px)] bg-base-200/30">
            <div className="border-b border-base-content/10 bg-base-100/80 backdrop-blur-sm px-4 py-3">
                <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link to="/maps" className="btn btn-ghost btn-xs">← Карти</Link>
                        <h1 className="font-display font-bold text-lg truncate">
                            {map?.title ?? 'Редактор'}
                        </h1>
                        <span
                            className={`badge badge-sm ${
                                map?.status === 'published' ? 'badge-success' : 'badge-warning'
                            }`}
                        >
                            {map?.status ?? 'draft'}
                        </span>
                        {dirty && <span className="badge badge-ghost badge-xs">не збережено</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="hidden md:flex items-center gap-3 text-xs opacity-60 mr-1">
                            <span><strong className="text-primary">{nodeCount}</strong> вузлів</span>
                            <span><strong className="text-accent">{edgeCount}</strong> ребер</span>
                            {validation && (
                                <span className={`badge badge-xs ${validation.valid ? 'badge-success' : 'badge-error'}`}>
                                    {validation.valid ? 'DAG ✓' : `${validation.errors.length} помилок`}
                                </span>
                            )}
                        </div>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => canvasRef.current?.autoLayout()}
                        >
                            Auto-layout
                        </button>
                        <Link to={`/map/${mapId}`} className="btn btn-ghost btn-sm">Перегляд</Link>
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={handleValidate}
                            disabled={validating}
                        >
                            {validating ? '...' : 'Валідувати'}
                        </button>
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={handleSave}
                            disabled={saving || !dirty}
                        >
                            {saving ? '...' : 'Зберегти'}
                        </button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handlePublish}
                            disabled={publishing || map?.status === 'published'}
                        >
                            {publishing ? '...' : 'Опублікувати'}
                        </button>
                    </div>
                </div>
                {statusMsg && (
                    <p className="text-xs text-center opacity-50 mt-1">{statusMsg}</p>
                )}
            </div>

            <div className="flex flex-1 overflow-hidden">
                {showSidebar && graph && (
                    <aside className="w-56 shrink-0 border-r border-base-content/10 bg-base-100/50 overflow-y-auto">
                        <div className="p-3 border-b border-base-content/5">
                            <p className="text-[10px] uppercase tracking-widest opacity-40 font-display font-semibold">
                                Вузли ({graph.nodes.length})
                            </p>
                        </div>
                        <ul className="p-2 space-y-0.5">
                            {[...graph.nodes]
                                .sort((a, b) => a.title.localeCompare(b.title))
                                .slice(0, 200)
                                .map((n) => (
                                    <li key={n.id}>
                                        <button
                                            className={`w-full text-left text-xs px-2 py-1.5 rounded-lg truncate ${
                                                activeNodeId === n.id
                                                    ? 'bg-primary/15 text-primary font-semibold'
                                                    : 'hover:bg-base-200/80 opacity-80'
                                            }`}
                                            onClick={() => {
                                                setActiveNodeId(n.id);
                                                canvasRef.current?.focusNode(n.id);
                                            }}
                                        >
                                            {n.title}
                                        </button>
                                    </li>
                                ))}
                            {graph.nodes.length > 200 && (
                                <li className="text-[10px] opacity-40 px-2 py-1">
                                    + ще {graph.nodes.length - 200}...
                                </li>
                            )}
                        </ul>
                    </aside>
                )}

                <div className="flex-1 flex flex-col min-w-0">
                    <div className="px-4 py-1.5 border-b border-base-content/5 flex justify-between items-center">
                        <p className="text-xs opacity-50">
                            React Flow · перетягни вузол · з&apos;єднуй handles · Del — видалити
                        </p>
                        <button className="btn btn-ghost btn-xs" onClick={() => setShowSidebar((p) => !p)}>
                            {showSidebar ? '← Панель' : '→ Панель'}
                        </button>
                    </div>
                    <div className="flex-1 relative min-h-[400px]">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center opacity-60">
                                Завантаження графу...
                            </div>
                        ) : (
                            <FlowCanvas
                                ref={canvasRef}
                                graph={graph}
                                onSelectionChange={setActiveNodeId}
                                onGraphDirty={() => setDirty(true)}
                                onNodesDelete={handleNodesDelete}
                                onEdgesDelete={handleEdgesDelete}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
