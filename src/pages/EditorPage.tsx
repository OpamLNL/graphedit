import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
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
    applyPendingNodePositions,
    applyLayoutSnapshot,
    applyGroupContextForSave,
    buildEditorSaveSnapshot,
    editorStateToBulkSave,
    editorStateToGraphPayload,
    initEditorState,
    type EditorSaveSnapshot,
    type EditorState,
    type GroupEdgeState,
    type KnowledgeNodeData,
} from '../components/FlowEditor/layoutUtils';
import { layoutTopicGraphByEdges } from '../utils/graphLayout';
import { mergeGroupLayouts } from '../utils/groupGraph';
import type { GroupGraphResponse } from '../api/nodes';
import {
    knowledgeMapsApi,
    type GraphValidationResult,
    type KnowledgeMap,
} from '../api/knowledgeMaps';
import { nodesApi } from '../api/nodes';
import { topicsApi, type Topic } from '../api/topics';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';

function groupLayoutOverridesFromMeta(
    groupMeta: GroupGraphResponse | null | undefined,
): Record<string, { x: number; y: number }> {
    const overrides: Record<string, { x: number; y: number }> = {};
    for (const g of groupMeta?.groups ?? []) {
        if (g.x != null && g.y != null) {
            overrides[g.id] = { x: Math.round(g.x), y: Math.round(g.y) };
        }
    }
    for (const [id, pos] of Object.entries(groupMeta?.groupLayout ?? {})) {
        overrides[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };
    }
    return overrides;
}

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
    const [connectMode, setConnectMode] = useState(false);
    const [showRightPanel, setShowRightPanel] = useState(true);
    const [groupLayoutOverrides, setGroupLayoutOverrides] = useState<
        Record<string, { x: number; y: number }>
    >({});
    const saveSnapshotRef = useRef<EditorSaveSnapshot | null>(null);
    const editorStateRef = useRef<EditorState | null>(null);
    const nodeLayoutReaderRef = useRef<(() => Map<number, { x: number; y: number }>) | null>(null);
    const groupEdgesRef = useRef<GroupEdgeState[]>([]);
    const deletedNodeIdsRef = useRef<number[]>([]);
    const deletedEdgeIdsRef = useRef<number[]>([]);
    const deletedGroupEdgeIdsRef = useRef<number[]>([]);
    const pendingNodePositionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const dirtyNodeIdsRef = useRef<Set<number>>(new Set());
    const dirtyEdgeKeysRef = useRef<Set<string>>(new Set());

    const updateEditorState = useCallback((updater: SetStateAction<EditorState | null>) => {
        setEditorState((prev) => {
            const next =
                typeof updater === 'function'
                    ? (updater as (value: EditorState | null) => EditorState | null)(prev)
                    : updater;
            editorStateRef.current = next;
            return next;
        });
    }, []);

    const isEditor = role === 'admin' || role === 'teacher';
    const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

    editorStateRef.current = editorState;
    groupEdgesRef.current = groupEdges;
    deletedNodeIdsRef.current = deletedNodeIds;
    deletedEdgeIdsRef.current = deletedEdgeIds;
    deletedGroupEdgeIdsRef.current = deletedGroupEdgeIds;

    useEffect(() => {
        if (authLoading || !user || !mapId || Number.isNaN(mapId)) {
            if (!authLoading) setLoading(false);
            return;
        }
        if (!isEditor) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        Promise.all([
            knowledgeMapsApi.getOne(mapId),
            knowledgeMapsApi.getEditorGraph(mapId),
            topicsApi.getAll(),
            nodesApi.getGroupGraph(mapId).catch(() => null),
        ])
            .then(([m, g, t, groupMeta]) => {
                if (cancelled) return;
                setMap(m);
                setTopics(t);
                const tMap = new Map(t.map((topic) => [topic.id, topic]));
                const nextState = initEditorState(g, tMap);
                const nextGroups = groupMeta?.groups ?? [];
                const nextOverrides = groupLayoutOverridesFromMeta(groupMeta);
                const nextGroupEdges = (groupMeta?.groupEdges ?? []).map((e) => ({
                    id: e.id,
                    from: e.from,
                    to: e.to,
                    type: e.type,
                }));
                updateEditorState(nextState);
                setGroups(nextGroups);
                setGroupLayoutOverrides(nextOverrides);
                setGroupEdges(nextGroupEdges);
                saveSnapshotRef.current = buildEditorSaveSnapshot(
                    nextState,
                    nextGroupEdges,
                    mergeGroupLayouts(
                        nextGroups.length > 0
                            ? nextGroups
                            : editorStateToGraphPayload(nextState, nextGroups, nextGroupEdges, tMap)
                                  .groups,
                        nextOverrides,
                    ),
                );
                pendingNodePositionsRef.current.clear();
                dirtyNodeIdsRef.current.clear();
                dirtyEdgeKeysRef.current.clear();
                setDeletedNodeIds([]);
                setDeletedEdgeIds([]);
                setDeletedGroupEdgeIds([]);
                setDirty(false);
                setValidation(null);
                setViewScope('groups');
                setSelectedGroupId(null);
                setActiveGroupId(null);
                setConnectMode(false);
                setConnectSourceId(null);
                setConnectSourceGroupId(null);
            })
            .catch((e) => {
                if (cancelled) return;
                console.error(e);
                setStatusMsg(parseApiError(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user, isEditor, mapId, authLoading]);

    const graphPayload = useMemo((): GraphPayload | null => {
        if (!editorState) return null;
        const payload = editorStateToGraphPayload(editorState, groups, groupEdges, topicById);
        if (Object.keys(groupLayoutOverrides).length === 0) return payload;
        return {
            ...payload,
            groups: mergeGroupLayouts(payload.groups, groupLayoutOverrides),
        };
    }, [editorState, groups, groupEdges, topicById, groupLayoutOverrides]);

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

    const handleClearSelection = useCallback(() => {
        setActiveNodeId(null);
        setConnectSourceId(null);
    }, []);

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
        const currentEditorState = editorStateRef.current;
        if (!mapId || !currentEditorState) return;
        setSaving(true);
        setStatusMsg(null);
        try {
            const layoutSnapshot = nodeLayoutReaderRef.current?.() ?? new Map();
            let stateForSave = applyLayoutSnapshot(currentEditorState, layoutSnapshot);
            stateForSave = applyPendingNodePositions(
                stateForSave,
                pendingNodePositionsRef.current,
            );
            stateForSave = applyGroupContextForSave(
                stateForSave,
                new Map(topics.map((t) => [t.id, t])),
                viewScope === 'topics' ? selectedGroupId : null,
                dirtyNodeIdsRef.current,
            );
            const groupsForSave =
                graphPayload?.groups ?? mergeGroupLayouts(groups, groupLayoutOverrides);
            const payload = editorStateToBulkSave(
                stateForSave,
                groupEdgesRef.current,
                groupsForSave,
                deletedNodeIdsRef.current,
                deletedEdgeIdsRef.current,
                deletedGroupEdgeIdsRef.current,
                saveSnapshotRef.current,
                dirtyNodeIdsRef.current,
                dirtyEdgeKeysRef.current,
                false,
            );
            console.log('[Editor save] PATCH /knowledge-maps/' + mapId + '/graph', {
                payload,
                summary: {
                    nodes: payload.nodes.length,
                    edges: payload.edges.length,
                    groupEdges: payload.groupEdges?.length ?? 0,
                    groupLayouts: payload.groupLayouts?.length ?? 0,
                    deletedNodeIds: payload.deletedNodeIds?.length ?? 0,
                    deletedEdgeIds: payload.deletedEdgeIds?.length ?? 0,
                    deletedGroupEdgeIds: payload.deletedGroupEdgeIds?.length ?? 0,
                },
                stateForSave: {
                    nodeCount: stateForSave.nodes.length,
                    edgeCount: stateForSave.edges.length,
                    layoutSnapshotSize: layoutSnapshot.size,
                    pendingPositionsSize: pendingNodePositionsRef.current.size,
                },
            });
            const saved = await knowledgeMapsApi.saveGraph(mapId, payload);
            const updatedTopics = await topicsApi.getAll().catch(() => topics);
            setTopics(updatedTopics);
            const tMap = new Map(updatedTopics.map((t) => [t.id, t]));
            const nextState = initEditorState(saved, tMap);
            updateEditorState(nextState);
            const groupMeta = await nodesApi.getGroupGraph(mapId).catch(() => null);
            let nextGroups = groups;
            let nextOverrides = groupLayoutOverrides;
            let nextGroupEdges = groupEdges;
            if (groupMeta) {
                nextGroups = groupMeta.groups ?? [];
                nextOverrides = groupLayoutOverridesFromMeta(groupMeta);
                nextGroupEdges = (groupMeta.groupEdges ?? []).map((e) => ({
                    id: e.id,
                    from: e.from,
                    to: e.to,
                    type: e.type,
                }));
                setGroups(nextGroups);
                setGroupLayoutOverrides(nextOverrides);
                setGroupEdges(nextGroupEdges);
            }
            saveSnapshotRef.current = buildEditorSaveSnapshot(
                nextState,
                nextGroupEdges,
                mergeGroupLayouts(
                    nextGroups.length > 0
                        ? nextGroups
                        : editorStateToGraphPayload(nextState, nextGroups, nextGroupEdges, tMap)
                              .groups,
                    nextOverrides,
                ),
            );
            pendingNodePositionsRef.current.clear();
            dirtyNodeIdsRef.current.clear();
            dirtyEdgeKeysRef.current.clear();
            setDeletedNodeIds([]);
            setDeletedEdgeIds([]);
            setDeletedGroupEdgeIds([]);
            setDirty(false);
            setConnectSourceId(null);
            setConnectSourceGroupId(null);
            setStatusMsg('Збережено');
        } catch (e) {
            console.error(e);
            setStatusMsg(`Помилка збереження: ${parseApiError(e)}`);
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
        setConnectMode(false);
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
        setConnectMode(false);
    };

    const handleConnectNodes = (fromId: number, toId: number) => {
        if (!editorState || fromId === toId) return;
        const exists = editorState.edges.some(
            (e) => e.fromNodeId === fromId && e.toNodeId === toId,
        );
        if (exists) return;
        updateEditorState((prev) =>
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
        dirtyEdgeKeysRef.current.add(`${fromId}-${toId}`);
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
        updateEditorState((prev) =>
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
            const pos = { x: Math.round(x), y: Math.round(y) };
            pendingNodePositionsRef.current.set(nodeId, pos);
            dirtyNodeIdsRef.current.add(nodeId);
            updateEditorState((prev) =>
                prev
                    ? {
                          ...prev,
                          nodes: prev.nodes.map((n) =>
                              n.id === nodeId ? { ...n, ...pos } : n,
                          ),
                      }
                    : prev,
            );
            markDirty();
        },
        [markDirty],
    );

    const handleGroupPositionChange = useCallback(
        (groupId: string, x: number, y: number) => {
            const pos = { x: Math.round(x), y: Math.round(y) };
            setGroupLayoutOverrides((prev) => ({ ...prev, [groupId]: pos }));
            setGroups((prev) => {
                const found = prev.some((g) => g.id === groupId);
                if (!found) return prev;
                return prev.map((g) => (g.id === groupId ? { ...g, ...pos } : g));
            });
            markDirty();
        },
        [markDirty],
    );

    const handleAddNode = async () => {
        if (!selectedGroupId || !editorState) return;
        const id = allocateTempNodeId();
        const groupNodes = editorState.nodes.filter((n) => n.groupId === selectedGroupId);
        const ids = new Set(groupNodes.map((n) => n.id));
        const groupEdges = editorState.edges.filter(
            (e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId),
        );
        const allIds = [...groupNodes.map((n) => n.id), id];
        const sortKeys = new Map<number, number>(
            groupNodes.map((n) => [n.id, n.topicId ?? n.id]),
        );
        sortKeys.set(id, id);
        const pos =
            layoutTopicGraphByEdges(
                allIds,
                groupEdges.map((e) => ({ from: e.fromNodeId, to: e.toNodeId })),
                sortKeys,
            ).get(id) ?? { x: 0, y: 0 };

        try {
            const topic = await topicsApi.create({
                title: 'Новий вузол',
                description: 'Новий вузол',
                groupId: selectedGroupId,
            });
            setTopics((prev) => [...prev, topic]);

            updateEditorState((prev) =>
                prev
                    ? {
                          ...prev,
                          nodes: [
                              ...prev.nodes,
                              {
                                  id,
                                  title: 'Новий вузол',
                                  topicId: topic.id,
                                  x: pos.x,
                                  y: pos.y,
                                  color: '#6366f1',
                                  groupId: selectedGroupId,
                              },
                          ],
                      }
                    : prev,
            );
            dirtyNodeIdsRef.current.add(id);
            setActiveNodeId(id);
            markDirty();
        } catch (e) {
            setStatusMsg(parseApiError(e));
        }
    };

    const handleAutoLayout = () => {
        if (!selectedGroupId || !editorState) return;
        const next = autoLayoutEditorGroup(editorState, selectedGroupId);
        for (const n of next.nodes) {
            if (n.groupId === selectedGroupId) {
                dirtyNodeIdsRef.current.add(n.id);
            }
        }
        updateEditorState(next);
        markDirty();
    };

    const handleNodePatch = (patch: Partial<KnowledgeNodeData>) => {
        if (activeNodeId == null || !editorState) return;
        let groupId = patch.groupId;
        if (patch.topicId !== undefined) {
            const topic = patch.topicId != null ? topicById.get(patch.topicId) : undefined;
            groupId = topic?.groupId ?? null;
        }
        const currentNode = editorState.nodes.find((n) => n.id === activeNodeId);
        const nextTitle = patch.label ?? currentNode?.title;
        updateEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      nodes: prev.nodes.map((n) =>
                          n.id === activeNodeId
                              ? {
                                    ...n,
                                    title: nextTitle ?? n.title,
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
        if (patch.label !== undefined && currentNode?.topicId != null) {
            const trimmed = patch.label.trim() || 'Новий вузол';
            setTopics((prev) =>
                prev.map((t) =>
                    t.id === currentNode.topicId
                        ? { ...t, title: trimmed, description: trimmed }
                        : t,
                ),
            );
        }
        dirtyNodeIdsRef.current.add(activeNodeId);
        markDirty();
    };

    const handleDeleteActiveNode = () => {
        if (activeNodeId == null || !editorState) return;
        if (activeNodeId > 0) {
            setDeletedNodeIds((prev) => [...prev, activeNodeId]);
        }
        updateEditorState((prev) =>
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
                                    {validation.valid
                                        ? validation.warnings.length > 0
                                            ? `OK · ${validation.warnings.length} застер.`
                                            : 'OK ✓'
                                        : `${validation.errors.length} помилок`}
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
                            : 'Групи: клік — обрати · клік стрілки — обрати ребро · Del — видалити ребро · «Зʼєднання ✓» — нове ребро · «У групу →» — теми'
                        : connectMode
                          ? 'Теми: клік початковий → клік кінцевий вузол · Del — видалити ребро · «Зберегти»'
                          : 'Теми: клік — обрати вузол · клік стрілки — обрати ребро · Del — видалити ребро · «Зʼєднання ✓» — нове ребро'}
                </p>

                {statusMsg && (
                    <p className="text-xs text-center opacity-60 max-w-2xl mx-auto truncate" title={statusMsg}>
                        {statusMsg}
                    </p>
                )}
                {validation && validation.warnings.length > 0 && (
                    <ul className="text-xs text-warning max-w-3xl mx-auto space-y-0.5">
                        {validation.warnings.slice(0, 3).map((warn) => (
                            <li key={warn}>⚠ {warn}</li>
                        ))}
                    </ul>
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
                                onGroupPositionChange={handleGroupPositionChange}
                                onBackToGroups={handleBackToGroups}
                                onClearSelection={handleClearSelection}
                                viewportStorageId={mapId}
                                nodeLayoutReaderRef={nodeLayoutReaderRef}
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
