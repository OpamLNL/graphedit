import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import NodeEditorPanel from '../components/FlowEditor/NodeEditorPanel';
import Graph, {
    type GraphPayload,
    type GraphViewScope,
    type GroupData,
} from '../components/Graph/Graph';
import {
    allocateTempEdgeId,
    allocateTempNodeId,
    autoLayoutEditorGroup,
    editorStateToBulkSave,
    editorStateToGraphPayload,
    initEditorState,
    type EditorState,
    type GroupEdgeState,
    type KnowledgeNodeData,
} from '../components/FlowEditor/layoutUtils';
import {
    knowledgeMapsApi,
    type GraphValidationResult,
    type KnowledgeMap,
} from '../api/knowledgeMaps';
import { nodesApi } from '../api/nodes';
import { topicsApi, type Topic } from '../api/topics';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

function parseApiError(e: unknown): string {
    if (e instanceof ApiError) {
        try {
            const body = JSON.parse(e.message) as { message?: string | string[]; errors?: string[] };
            if (Array.isArray(body.errors) && body.errors.length > 0) return body.errors.join('; ');
            if (Array.isArray(body.message)) return body.message.join('; ');
            if (typeof body.message === 'string') return body.message;
        } catch {
            /* not json */
        }
        return e.message;
    }
    return 'Невідома помилка';
}

export default function EditorPage() {
    const { mapId: mapIdParam } = useParams<{ mapId: string }>();
    const mapId = Number(mapIdParam);
    const { user, role, loading: authLoading } = useAuth();

    const [map, setMap] = useState<KnowledgeMap | null>(null);
    const [editorState, setEditorState] = useState<EditorState | null>(null);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [groups, setGroups] = useState<GroupData[]>([]);
    const [groupEdges, setGroupEdges] = useState<GroupEdgeState[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
    const [connectSourceId, setConnectSourceId] = useState<number | null>(null);
    const [connectSourceGroupId, setConnectSourceGroupId] = useState<string | null>(null);
    const [validation, setValidation] = useState<GraphValidationResult | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [validating, setValidating] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [deletedNodeIds, setDeletedNodeIds] = useState<number[]>([]);
    const [deletedEdgeIds, setDeletedEdgeIds] = useState<number[]>([]);
    const [deletedGroupEdgeIds, setDeletedGroupEdgeIds] = useState<number[]>([]);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [viewScope, setViewScope] = useState<GraphViewScope>('groups');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [connectMode, setConnectMode] = useState(true);
    const [showRightPanel, setShowRightPanel] = useState(true);

    const isEditor = role === 'admin' || role === 'teacher';
    const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

    useEffect(() => {
        if (!user || !isEditor || !mapId || Number.isNaN(mapId)) {
            setLoading(false);
            return;
        }

        setLoading(true);
        Promise.all([
            knowledgeMapsApi.getOne(mapId),
            knowledgeMapsApi.getEditorGraph(mapId),
            topicsApi.getAll(),
            nodesApi.getGroupGraph(mapId).catch(() => null),
        ])
            .then(([m, g, t, groupMeta]) => {
                setMap(m);
                setTopics(t);
                const tMap = new Map(t.map((topic) => [topic.id, topic]));
                setEditorState(initEditorState(g, tMap));
                setGroups(groupMeta?.groups ?? []);
                setGroupEdges(
                    (groupMeta?.groupEdges ?? []).map((e) => ({
                        id: e.id,
                        from: e.from,
                        to: e.to,
                        type: e.type,
                    })),
                );
                setDeletedNodeIds([]);
                setDeletedEdgeIds([]);
                setDeletedGroupEdgeIds([]);
                setDirty(false);
                setValidation(null);
                setViewScope('groups');
                setSelectedGroupId(null);
                setActiveGroupId(null);
                setConnectMode(true);
                setConnectSourceId(null);
                setConnectSourceGroupId(null);
            })
            .catch((e) => {
                console.error(e);
                setStatusMsg(parseApiError(e));
            })
            .finally(() => setLoading(false));
    }, [user, isEditor, mapId]);

    const graphPayload = useMemo((): GraphPayload | null => {
        if (!editorState) return null;
        return editorStateToGraphPayload(editorState, groups, groupEdges, topicById);
    }, [editorState, groups, groupEdges, topicById]);

    const resolvedGroups = graphPayload?.groups ?? groups;

    const selectedGroup = useMemo(
        () => resolvedGroups.find((g) => g.id === selectedGroupId) ?? null,
        [resolvedGroups, selectedGroupId],
    );

    const activeGroup = useMemo(
        () => resolvedGroups.find((g) => g.id === activeGroupId) ?? null,
        [resolvedGroups, activeGroupId],
    );

    const activeNode = useMemo((): KnowledgeNodeData | null => {
        if (activeNodeId == null || !editorState) return null;
        const n = editorState.nodes.find((node) => node.id === activeNodeId);
        if (!n) return null;
        return {
            label: n.title,
            topicId: n.topicId,
            color: n.color,
            dbId: n.id,
            groupId: n.groupId,
        };
    }, [activeNodeId, editorState]);

    const markDirty = useCallback(() => setDirty(true), []);

    const handleValidate = async () => {
        if (!mapId) return;
        setValidating(true);
        setStatusMsg(null);
        try {
            const result = await knowledgeMapsApi.validate(mapId);
            setValidation(result);
            setStatusMsg(result.valid ? 'Граф валідний ✓' : `Помилки: ${result.errors.length}`);
        } catch (e) {
            setStatusMsg(parseApiError(e));
        } finally {
            setValidating(false);
        }
    };

    const handleSave = async () => {
        if (!mapId || !editorState) return;
        setSaving(true);
        setStatusMsg(null);
        try {
            const payload = editorStateToBulkSave(
                editorState,
                groupEdges,
                deletedNodeIds,
                deletedEdgeIds,
                deletedGroupEdgeIds,
            );
            const saved = await knowledgeMapsApi.saveGraph(mapId, payload);
            const tMap = new Map(topics.map((t) => [t.id, t]));
            setEditorState(initEditorState(saved, tMap));
            const groupMeta = await nodesApi.getGroupGraph(mapId).catch(() => null);
            if (groupMeta) {
                setGroups(groupMeta.groups ?? []);
                setGroupEdges(
                    (groupMeta.groupEdges ?? []).map((e) => ({
                        id: e.id,
                        from: e.from,
                        to: e.to,
                        type: e.type,
                    })),
                );
            }
            setDeletedNodeIds([]);
            setDeletedEdgeIds([]);
            setDeletedGroupEdgeIds([]);
            setDirty(false);
            setConnectSourceId(null);
            setConnectSourceGroupId(null);
            setStatusMsg('Збережено');
        } catch (e) {
            console.error(e);
            setStatusMsg(parseApiError(e));
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
            setStatusMsg(parseApiError(e));
        } finally {
            setPublishing(false);
        }
    };

    const handleOpenGroup = (groupId?: string) => {
        const targetId = groupId ?? activeGroupId;
        if (!targetId) return;
        setSelectedGroupId(targetId);
        setViewScope('topics');
        setActiveNodeId(null);
        setConnectSourceId(null);
        setConnectSourceGroupId(null);
        setConnectMode(true);
    };

    const handleSelectGroupTab = (groupId: string) => {
        if (viewScope === 'topics') {
            handleOpenGroup(groupId);
            return;
        }
        setActiveGroupId(groupId);
        setConnectSourceGroupId(null);
    };

    const handleBackToGroups = () => {
        setViewScope('groups');
        setSelectedGroupId(null);
        setActiveNodeId(null);
        setConnectSourceId(null);
        setConnectSourceGroupId(null);
        setConnectMode(true);
    };

    const handleConnectNodes = (fromId: number, toId: number) => {
        if (!editorState || fromId === toId) return;
        const exists = editorState.edges.some(
            (e) => e.fromNodeId === fromId && e.toNodeId === toId,
        );
        if (exists) return;
        setEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      edges: [
                          ...prev.edges,
                          {
                              id: allocateTempEdgeId(),
                              fromNodeId: fromId,
                              toNodeId: toId,
                              type: 'prerequisite',
                          },
                      ],
                  }
                : prev,
        );
        markDirty();
    };

    const handleEdgesDelete = (edges: { from: number; to: number; id?: string }[]) => {
        if (!editorState || edges.length === 0) return;
        const toRemove = new Set(edges.map((e) => `${e.from}-${e.to}`));
        const removed = editorState.edges.filter((e) =>
            toRemove.has(`${e.fromNodeId}-${e.toNodeId}`),
        );
        const dbIds = removed.map((e) => e.id).filter((id) => id > 0);
        if (dbIds.length > 0) {
            setDeletedEdgeIds((prev) => [...prev, ...dbIds]);
        }
        setEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      edges: prev.edges.filter(
                          (e) => !toRemove.has(`${e.fromNodeId}-${e.toNodeId}`),
                      ),
                  }
                : prev,
        );
        markDirty();
    };

    const handleConnectGroups = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const exists = groupEdges.some((e) => e.from === fromId && e.to === toId);
        if (exists) return;
        setGroupEdges((prev) => [
            ...prev,
            {
                id: allocateTempEdgeId(),
                from: fromId,
                to: toId,
                type: 'prerequisite',
            },
        ]);
        markDirty();
    };

    const handleGroupEdgesDelete = (edges: { from: string; to: string; id?: number }[]) => {
        if (edges.length === 0) return;
        const toRemove = new Set(edges.map((e) => `${e.from}-${e.to}`));
        const removed = groupEdges.filter((e) => toRemove.has(`${e.from}-${e.to}`));
        const dbIds = removed.map((e) => e.id).filter((id) => id > 0);
        if (dbIds.length > 0) {
            setDeletedGroupEdgeIds((prev) => [...prev, ...dbIds]);
        }
        setGroupEdges((prev) => prev.filter((e) => !toRemove.has(`${e.from}-${e.to}`)));
        markDirty();
    };

    const handleNodePositionChange = useCallback(
        (nodeId: number, x: number, y: number) => {
            setEditorState((prev) =>
                prev
                    ? {
                          ...prev,
                          nodes: prev.nodes.map((n) =>
                              n.id === nodeId
                                  ? { ...n, x: Math.round(x), y: Math.round(y) }
                                  : n,
                          ),
                      }
                    : prev,
            );
            markDirty();
        },
        [markDirty],
    );

    const handleAddNode = () => {
        if (!selectedGroupId) return;
        const id = allocateTempNodeId();
        setEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      nodes: [
                          ...prev.nodes,
                          {
                              id,
                              title: 'Новий вузол',
                              topicId: null,
                              x: 0,
                              y: 0,
                              color: '#6366f1',
                              groupId: selectedGroupId,
                          },
                      ],
                  }
                : prev,
        );
        setActiveNodeId(id);
        markDirty();
    };

    const handleAutoLayout = () => {
        if (!selectedGroupId || !editorState) return;
        setEditorState(autoLayoutEditorGroup(editorState, selectedGroupId));
        markDirty();
    };

    const handleNodePatch = (patch: Partial<KnowledgeNodeData>) => {
        if (activeNodeId == null || !editorState) return;
        let groupId = patch.groupId;
        if (patch.topicId !== undefined) {
            const topic = patch.topicId != null ? topicById.get(patch.topicId) : undefined;
            groupId = topic?.groupId ?? null;
        }
        setEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      nodes: prev.nodes.map((n) =>
                          n.id === activeNodeId
                              ? {
                                    ...n,
                                    title: patch.label ?? n.title,
                                    topicId:
                                        patch.topicId !== undefined
                                            ? patch.topicId
                                            : n.topicId,
                                    color: patch.color ?? n.color,
                                    groupId:
                                        groupId !== undefined ? groupId : n.groupId,
                                }
                              : n,
                      ),
                  }
                : prev,
        );
        markDirty();
    };

    const handleDeleteActiveNode = () => {
        if (activeNodeId == null || !editorState) return;
        if (activeNodeId > 0) {
            setDeletedNodeIds((prev) => [...prev, activeNodeId]);
        }
        setEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      nodes: prev.nodes.filter((n) => n.id !== activeNodeId),
                      edges: prev.edges.filter(
                          (e) =>
                              e.fromNodeId !== activeNodeId && e.toNodeId !== activeNodeId,
                      ),
                  }
                : prev,
        );
        setActiveNodeId(null);
        markDirty();
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (connectSourceId != null) setConnectSourceId(null);
                else if (connectSourceGroupId != null) setConnectSourceGroupId(null);
                else if (connectMode) setConnectMode(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [connectMode, connectSourceId, connectSourceGroupId]);

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

    const nodeCount = editorState?.nodes.length ?? 0;
    const edgeCount = editorState?.edges.length ?? 0;
    const groupEdgeCount = groupEdges.length;

    return (
        <div className="flex flex-col min-h-[calc(100vh-57px)] bg-base-200/30">
            <div className="border-b border-base-content/10 bg-base-100/80 backdrop-blur-sm px-4 py-3 space-y-2">
                <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
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

                        <div className="flex items-center gap-1 text-xs opacity-70">
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
                                    <span className="font-medium truncate max-w-[180px]" title={selectedGroup.title}>
                                        {selectedGroup.title}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="hidden md:flex items-center gap-3 text-xs opacity-60 mr-1">
                            <span><strong className="text-primary">{nodeCount}</strong> вузлів</span>
                            <span><strong className="text-accent">{edgeCount}</strong> ребер тем</span>
                            <span><strong className="text-secondary">{groupEdgeCount}</strong> ребер груп</span>
                            {validation && (
                                <span className={`badge badge-xs ${validation.valid ? 'badge-success' : 'badge-error'}`}>
                                    {validation.valid ? 'DAG ✓' : `${validation.errors.length} помилок`}
                                </span>
                            )}
                        </div>

                        {viewScope === 'groups' && (
                            <>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${connectMode ? 'btn-warning' : 'btn-ghost'}`}
                                    onClick={() => {
                                        setConnectMode((v) => !v);
                                        setConnectSourceGroupId(null);
                                    }}
                                >
                                    {connectMode ? 'Зʼєднання ✓' : 'Виділення'}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    disabled={!activeGroupId}
                                    onClick={() => handleOpenGroup()}
                                >
                                    У групу →
                                </button>
                            </>
                        )}

                        {viewScope === 'topics' && (
                            <>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddNode}>
                                    + Вузол
                                </button>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${connectMode ? 'btn-warning' : 'btn-ghost'}`}
                                    onClick={() => {
                                        setConnectMode((v) => !v);
                                        setConnectSourceId(null);
                                    }}
                                >
                                    {connectMode ? 'Зʼєднання ✓' : 'Виділення'}
                                </button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={handleAutoLayout}>
                                    Auto-layout
                                </button>
                            </>
                        )}

                        <Link to={`/map/${mapId}`} className="btn btn-ghost btn-sm">Перегляд</Link>
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={handleValidate}
                            disabled={validating}
                        >
                            {validating ? '...' : 'Валідувати'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={handleSave}
                            disabled={saving || !dirty}
                        >
                            {saving ? '...' : 'Зберегти'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={handlePublish}
                            disabled={publishing || map?.status === 'published'}
                        >
                            {publishing ? '...' : 'Опублікувати'}
                        </button>
                    </div>
                </div>

                {resolvedGroups.length > 0 && (
                    <div className="max-w-[1600px] mx-auto flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                        {resolvedGroups.map((g) => (
                            <button
                                key={g.id}
                                type="button"
                                title={`${g.topicCount} тем`}
                                className={`btn btn-xs shrink-0 ${
                                    (viewScope === 'topics'
                                        ? selectedGroupId
                                        : activeGroupId) === g.id
                                        ? 'btn-secondary'
                                        : 'btn-ghost'
                                }`}
                                onClick={() => handleSelectGroupTab(g.id)}
                                onDoubleClick={() => handleOpenGroup(g.id)}
                            >
                                {g.title}
                                <span className="opacity-40 ml-1">({g.topicCount})</span>
                            </button>
                        ))}
                    </div>
                )}

                <p className="max-w-[1600px] mx-auto text-[10px] opacity-40">
                    {viewScope === 'groups'
                        ? connectMode
                            ? 'Групи: клік початкова → клік кінцева · Del — ребро · «У групу →» — теми всередині'
                            : 'Групи: клік — обрати · «У групу →» — редагування тем · «Зʼєднання ✓» — ребро між групами'
                        : connectMode
                          ? 'Теми: клік початковий → клік кінцевий вузол · Del — видалити ребро · «Зберегти»'
                          : 'Теми: клік — обрати вузол · «Зʼєднання ✓» — ребро двома кліками'}
                </p>

                {statusMsg && (
                    <p className="text-xs text-center opacity-60 max-w-2xl mx-auto truncate" title={statusMsg}>
                        {statusMsg}
                    </p>
                )}
                {validation && !validation.valid && (
                    <ul className="text-xs text-error max-w-3xl mx-auto space-y-0.5">
                        {validation.errors.slice(0, 5).map((err) => (
                            <li key={err}>• {err}</li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                <div className="flex-1 flex flex-col min-w-0 relative">
                    {loading || !graphPayload ? (
                        <div className="flex-1 flex items-center justify-center opacity-60">
                            Завантаження графу...
                        </div>
                    ) : (
                        <div className="flex-1 relative min-h-[400px]">
                            <Graph
                                payload={graphPayload}
                                viewScope={viewScope}
                                selectedGroupId={selectedGroupId}
                                activeNodeId={activeNodeId}
                                activeGroupId={activeGroupId}
                                activeNodeTitle={activeNode?.label ?? null}
                                editMode
                                connectMode={connectMode}
                                connectSourceId={connectSourceId}
                                connectSourceGroupId={connectSourceGroupId}
                                onGroupClick={setActiveGroupId}
                                onNodeClick={setActiveNodeId}
                                onConnectSourceChange={setConnectSourceId}
                                onConnectSourceGroupChange={setConnectSourceGroupId}
                                onConnectNodes={handleConnectNodes}
                                onConnectGroups={handleConnectGroups}
                                onEdgesDelete={handleEdgesDelete}
                                onGroupEdgesDelete={handleGroupEdgesDelete}
                                onNodePositionChange={handleNodePositionChange}
                                onBackToGroups={handleBackToGroups}
                            />
                        </div>
                    )}
                </div>

                {showRightPanel && viewScope === 'topics' && (
                    <aside className="w-72 shrink-0 border-l border-base-content/10 bg-base-100/50 flex flex-col">
                        <div className="p-3 border-b border-base-content/5 flex justify-between items-center">
                            <p className="text-[10px] uppercase tracking-widest opacity-40 font-display font-semibold">
                                Властивості
                            </p>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowRightPanel(false)}>
                                ×
                            </button>
                        </div>
                        <NodeEditorPanel
                            node={activeNode}
                            nodeKey={activeNodeId}
                            topics={topics}
                            onChange={handleNodePatch}
                            onDelete={handleDeleteActiveNode}
                        />
                    </aside>
                )}

                {!showRightPanel && viewScope === 'topics' && (
                    <button
                        type="button"
                        className="absolute right-2 top-2 btn btn-xs btn-ghost bg-base-100/90 z-10"
                        onClick={() => setShowRightPanel(true)}
                    >
                        ← Властивості
                    </button>
                )}
            </div>
        </div>
    );
}
