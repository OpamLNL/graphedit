import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import NodeEditorPanel from '../components/FlowEditor/NodeEditorPanel';
import EditorLibraryPanel from '../components/FlowEditor/EditorLibraryPanel';
import EditorValidationPanel from '../components/FlowEditor/EditorValidationPanel';
import EditorRevisionsPanel from '../components/FlowEditor/EditorRevisionsPanel';
import Graph, {
    type GraphPayload,
    type GraphViewScope,
    type GroupData,
} from '../components/Graph/Graph';
import {
    allocateTempEdgeId,
    allocateTempNodeId,
    allocateGroupId,
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
import {
    applyStoredNavigation,
    navigationStorageKey,
    saveStoredNavigation,
} from '../utils/graphNavigationStorage';
import type { GroupGraphResponse } from '../api/nodes';
import {
    graphEditMapsApi,
    type GraphValidationResult,
    type ImportLibraryGroup,
    type ImportLibraryNode,
    type GraphEditMap,
    type MapJsonImportPayload,
    type EditorGraphResponse,
} from '../api/graphEditMaps';
import { nodesApi } from '../api/nodes';
import { topicsApi, type Topic } from '../api/topics';
import { ApiError } from '../api/client';
import { remapImportJsonGroupIds } from '../utils/importJsonRemap';
import { useAuth } from '../context/AuthContext';
import MapGraphValidationBadge from '../components/MapGraphValidationBadge';
import { isMapGraphNotValidated } from '../utils/mapValidation';

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
            const body = JSON.parse(e.message) as {
                message?: string | string[] | { message?: string; errors?: string[] };
                errors?: string[];
            };
            if (Array.isArray(body.errors) && body.errors.length > 0) return body.errors.join('; ');
            if (typeof body.message === 'object' && body.message !== null) {
                const nested = body.message;
                if (Array.isArray(nested.errors) && nested.errors.length > 0) {
                    return nested.errors.join('; ');
                }
                if (typeof nested.message === 'string') return nested.message;
            }
            if (Array.isArray(body.message)) return body.message.join('; ');
            if (typeof body.message === 'string') return body.message;
        } catch {
            /* not json */
        }
        return e.message;
    }
    if (e instanceof Error) return e.message;
    return 'Невідома помилка';
}

export default function EditorPage() {
    const { mapId: mapIdParam } = useParams<{ mapId: string }>();
    const mapId = Number(mapIdParam);
    const { user, role, loading: authLoading } = useAuth();

    const [map, setMap] = useState<GraphEditMap | null>(null);
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
    const [deletedGroupIds, setDeletedGroupIds] = useState<string[]>([]);
    const [showLibraryPanel, setShowLibraryPanel] = useState(false);
    const [showRevisionsPanel, setShowRevisionsPanel] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [viewScope, setViewScope] = useState<GraphViewScope>('groups');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [connectMode, setConnectMode] = useState(false);
    const [showRightPanel, setShowRightPanel] = useState(true);
    const [rightPanelTab, setRightPanelTab] = useState<'properties' | 'validation'>('properties');
    const [groupLayoutOverrides, setGroupLayoutOverrides] = useState<
        Record<string, { x: number; y: number }>
    >({});
    const [graphReloadKey, setGraphReloadKey] = useState(0);
    const [jsonBusy, setJsonBusy] = useState(false);
    const importJsonInputRef = useRef<HTMLInputElement>(null);
    const saveSnapshotRef = useRef<EditorSaveSnapshot | null>(null);
    const editorStateRef = useRef<EditorState | null>(null);
    const nodeLayoutReaderRef = useRef<(() => Map<number, { x: number; y: number }>) | null>(null);
    const groupEdgesRef = useRef<GroupEdgeState[]>([]);
    const deletedNodeIdsRef = useRef<number[]>([]);
    const deletedEdgeIdsRef = useRef<number[]>([]);
    const deletedGroupEdgeIdsRef = useRef<number[]>([]);
    const deletedGroupIdsRef = useRef<string[]>([]);
    const pendingNodePositionsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
    const dirtyNodeIdsRef = useRef<Set<number>>(new Set());
    const dirtyEdgeKeysRef = useRef<Set<string>>(new Set());
    const unsavedGroupIdsRef = useRef<Set<string>>(new Set());
    const navReadyRef = useRef(false);

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
    deletedGroupIdsRef.current = deletedGroupIds;

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
            graphEditMapsApi.getOne(mapId),
            graphEditMapsApi.getEditorGraph(mapId),
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
                setDeletedGroupIds([]);
                setDirty(false);
                unsavedGroupIdsRef.current.clear();
                setValidation(null);
                setConnectMode(false);
                setConnectSourceId(null);
                setConnectSourceGroupId(null);

                if (!navReadyRef.current) {
                    navReadyRef.current = true;
                    const groupIds = new Set(nextGroups.map((g) => g.id));
                    for (const n of nextState.nodes) {
                        if (n.groupId) groupIds.add(n.groupId);
                    }
                    const nav = applyStoredNavigation(
                        mapId,
                        'editor',
                        groupIds,
                        nextState.nodes.map((n) => n.id),
                    );
                    setViewScope(nav.viewScope);
                    setSelectedGroupId(nav.selectedGroupId);
                    setActiveNodeId(nav.activeNodeId);
                    setActiveGroupId(nav.activeGroupId ?? nav.selectedGroupId);
                    if (nav.activeNodeId != null && nav.viewScope === 'topics') {
                        setTimeout(() => window.__focusGraphNode?.(nav.activeNodeId!), 300);
                    }
                }
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
    }, [user, isEditor, mapId, authLoading, graphReloadKey]);

    useEffect(() => {
        if (!mapId || Number.isNaN(mapId) || loading || !navReadyRef.current) return;
        saveStoredNavigation(navigationStorageKey(mapId, 'editor'), {
            viewScope,
            selectedGroupId,
            activeNodeId,
            activeGroupId,
        });
    }, [mapId, loading, viewScope, selectedGroupId, activeNodeId, activeGroupId]);

    useEffect(() => {
        navReadyRef.current = false;
    }, [mapId, graphReloadKey]);

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
        () =>
            resolvedGroups.find((g) => g.id === activeGroupId) ??
            groups.find((g) => g.id === activeGroupId) ??
            null,
        [resolvedGroups, groups, activeGroupId],
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

    const ensureGroupsPersisted = async (groupIds: string[]) => {
        if (!mapId) return;
        const pendingIds = groupIds.filter((id) => unsavedGroupIdsRef.current.has(id));
        if (pendingIds.length === 0) return;

        const payloadGroups = groups
            .filter((g) => pendingIds.includes(g.id))
            .map((g) => ({
                id: g.id,
                title: g.title,
                description: g.description,
                level: g.level,
                sortOrder: g.sortOrder,
            }));

        if (payloadGroups.length === 0) {
            throw new Error('Групу не знайдено в редакторі — спробуйте ще раз');
        }

        await graphEditMapsApi.saveGraph(mapId, {
            nodes: [],
            edges: [],
            groups: payloadGroups,
        });

        for (const id of pendingIds) {
            unsavedGroupIdsRef.current.delete(id);
        }
    };

    const handleValidationNodeClick = (nodeId: number, groupId: string | null) => {
        if (groupId) {
            setSelectedGroupId(groupId);
            setViewScope('topics');
        }
        setActiveNodeId(nodeId);
        setRightPanelTab('properties');
        setShowRightPanel(true);
    };

    const showValidationSidePanel = rightPanelTab === 'validation' && validation != null;
    const showPropertiesContent =
        rightPanelTab === 'properties' &&
        (viewScope === 'topics' || (viewScope === 'groups' && (activeGroup || activeGroupId)));
    /** Тримаємо aside змонтованим після валідації, щоб ширина графа не стрибала */
    const canShowRightAside =
        showValidationSidePanel ||
        showPropertiesContent ||
        (validation != null && rightPanelTab === 'properties');
    const showRightAside = showRightPanel && canShowRightAside;

    const rightPanelLabel =
        rightPanelTab === 'validation'
            ? 'Валідація'
            : viewScope === 'groups'
              ? 'Група'
              : 'Властивості';

    const handleValidate = async () => {
        if (!mapId || !editorState) return;
        setValidating(true);
        setStatusMsg(null);
        try {
            const payload = editorStateToGraphPayload(
                editorState,
                groups,
                groupEdges,
                topicById,
            );
            const result = await graphEditMapsApi.validate(mapId, {
                nodes: payload.nodes.map((n) => ({
                    id: n.id,
                    title: n.title,
                    groupId: n.groupId,
                })),
                edges: payload.edges.map((e) => ({ from: e.from, to: e.to })),
                groups: payload.groups.map((g) => ({ id: g.id, title: g.title })),
            });
            setValidation(result);
            setShowRightPanel(true);
            setRightPanelTab('validation');
            setStatusMsg(
                result.valid
                    ? result.warnings.length > 0
                        ? `Застережень: ${result.warnings.length}`
                        : 'Граф валідний ✓'
                    : `Граф невалідний · ${result.errors.length} помилок`,
            );
        } catch (e) {
            setStatusMsg(parseApiError(e));
        } finally {
            setValidating(false);
        }
    };

    const applySavedGraphResponse = useCallback(
        async (saved: EditorGraphResponse) => {
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
            setDeletedGroupIds([]);
            setDirty(false);
            unsavedGroupIdsRef.current.clear();
            setConnectSourceId(null);
            setConnectSourceGroupId(null);
            setActiveNodeId(null);
            setValidation(null);
            setGraphReloadKey((k) => k + 1);

            const mapMeta = await graphEditMapsApi.getOne(mapId);
            setMap(mapMeta);
        },
        [
            mapId,
            topics,
            groups,
            groupLayoutOverrides,
            groupEdges,
            updateEditorState,
        ],
    );

    const persistEditorGraph = useCallback(async (): Promise<void> => {
        const currentEditorState = editorStateRef.current;
        if (!mapId || !currentEditorState) {
            throw new Error('Немає даних для збереження');
        }

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
            deletedGroupIdsRef.current,
        );

        const saved = await graphEditMapsApi.saveGraph(mapId, payload);
        await applySavedGraphResponse(saved);
    }, [
        mapId,
        topics,
        graphPayload,
        groups,
        groupLayoutOverrides,
        groupEdges,
        viewScope,
        selectedGroupId,
        applySavedGraphResponse,
    ]);

    const handleRestoredFromRevision = useCallback(
        async (graph: EditorGraphResponse) => {
            await applySavedGraphResponse(graph);
            setStatusMsg('Карту відновлено зі знімка');
        },
        [applySavedGraphResponse],
    );

    const handleSave = async () => {
        setSaving(true);
        setStatusMsg(null);
        try {
            await persistEditorGraph();
            setStatusMsg('Збережено');
        } catch (e) {
            console.error(e);
            setStatusMsg(`Помилка збереження: ${parseApiError(e)}`);
        } finally {
            setSaving(false);
        }
    };

    const handleExportJson = async () => {
        if (!mapId || Number.isNaN(mapId)) return;
        setJsonBusy(true);
        setStatusMsg(null);
        try {
            const data = await graphEditMapsApi.exportJson(mapId);
            const safeTitle = (data.map.title || `map-${mapId}`)
                .replace(/[^\p{L}\p{N}\-_]+/gu, '-')
                .slice(0, 48);
            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: 'application/json;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${safeTitle || 'map'}-${mapId}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            const stats = data.mediaStats;
            setStatusMsg(
                stats
                    ? `JSON експортовано (${stats.embeddedImages} зображень вбудовано${stats.skippedImages ? `, ${stats.skippedImages} пропущено` : ''})`
                    : 'JSON експортовано',
            );
        } catch (e) {
            console.error(e);
            setStatusMsg(`Помилка експорту: ${parseApiError(e)}`);
        } finally {
            setJsonBusy(false);
        }
    };

    const handleImportJsonFile = async (file: File | null) => {
        if (!file || !mapId || Number.isNaN(mapId)) return;
        setJsonBusy(true);
        setStatusMsg(null);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text) as MapJsonImportPayload;
            if (!parsed.formatVersion || !Array.isArray(parsed.nodes)) {
                throw new Error('Невірний формат JSON (потрібні formatVersion та nodes)');
            }

            const replace = window.confirm(
                'Замінити всю поточну карту вмістом файлу?\n\nOK — замінити (replace)\nСкасувати — додати до карти (merge)',
            );

            const result = await graphEditMapsApi.importJson(mapId, {
                ...remapImportJsonGroupIds(parsed),
                importMode: replace ? 'replace' : 'merge',
            });

            setGraphReloadKey((k) => k + 1);
            setStatusMsg(
                `Імпортовано ${result.importedNodes} вузлів, ${result.importedEdges} ребер (${result.importMode})`,
            );
        } catch (e) {
            console.error(e);
            setStatusMsg(`Помилка імпорту: ${parseApiError(e)}`);
        } finally {
            setJsonBusy(false);
            if (importJsonInputRef.current) importJsonInputRef.current.value = '';
        }
    };

    const handlePublish = async () => {
        if (!mapId) return;
        setPublishing(true);
        setStatusMsg(null);
        try {
            if (dirty) {
                setSaving(true);
                try {
                    await persistEditorGraph();
                } finally {
                    setSaving(false);
                }
            }
            const updated = await graphEditMapsApi.publish(mapId);
            setMap(updated);
            setValidation(null);
            setStatusMsg(
                isMapGraphNotValidated(updated.graphValidated)
                    ? 'Опубліковано з позначкою «не валідовано»'
                    : 'Опубліковано',
            );
        } catch (e) {
            console.error(e);
            setStatusMsg(`Помилка публікації: ${parseApiError(e)}`);
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

    const handleAddGroup = () => {
        const id = allocateGroupId();
        const maxOrder = groups.reduce((max, g) => Math.max(max, g.sortOrder), 0);
        const newGroup: GroupData = {
            id,
            title: 'Нова група',
            description: null,
            level: 0,
            sortOrder: maxOrder + 1,
            topicCount: 0,
            completedCount: 0,
            availableCount: 0,
            progressPercent: 0,
        };
        setGroups((prev) => [...prev, newGroup]);
        unsavedGroupIdsRef.current.add(id);
        setActiveGroupId(id);
        setShowRightPanel(true);
        setRightPanelTab('properties');
        markDirty();
    };

    const handleGroupPatch = (patch: { title?: string; description?: string | null }) => {
        if (!activeGroupId) return;
        setGroups((prev) =>
            prev.map((g) =>
                g.id === activeGroupId
                    ? {
                          ...g,
                          ...(patch.title !== undefined ? { title: patch.title } : {}),
                          ...(patch.description !== undefined
                              ? { description: patch.description }
                              : {}),
                      }
                    : g,
            ),
        );
        markDirty();
    };

    const handleDeleteGroup = () => {
        if (!activeGroupId || !editorState) return;
        const groupId = activeGroupId;
        if (!window.confirm('Видалити групу разом із її вузлами на цій карті?')) return;

        const nodesInGroup = editorState.nodes.filter((n) => n.groupId === groupId);
        const nodeIdsToRemove = new Set(nodesInGroup.map((n) => n.id));
        const dbNodeIds = nodesInGroup.map((n) => n.id).filter((id) => id > 0);
        if (dbNodeIds.length > 0) {
            setDeletedNodeIds((prev) => [...prev, ...dbNodeIds]);
        }

        const removedGroupEdges = groupEdges.filter(
            (e) => e.from === groupId || e.to === groupId,
        );
        const dbGroupEdgeIds = removedGroupEdges.map((e) => e.id).filter((id) => id > 0);
        if (dbGroupEdgeIds.length > 0) {
            setDeletedGroupEdgeIds((prev) => [...prev, ...dbGroupEdgeIds]);
        }

        setDeletedGroupIds((prev) => [...prev, groupId]);
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
        setGroupEdges((prev) =>
            prev.filter((e) => e.from !== groupId && e.to !== groupId),
        );
        updateEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      nodes: prev.nodes.filter((n) => n.groupId !== groupId),
                      edges: prev.edges.filter(
                          (e) =>
                              !nodeIdsToRemove.has(e.fromNodeId) &&
                              !nodeIdsToRemove.has(e.toNodeId),
                      ),
                  }
                : prev,
        );
        setGroupLayoutOverrides((prev) => {
            const next = { ...prev };
            delete next[groupId];
            return next;
        });
        if (selectedGroupId === groupId) {
            setSelectedGroupId(null);
            setViewScope('groups');
        }
        setActiveGroupId(null);
        markDirty();
    };

    const handleImportGroup = async (item: ImportLibraryGroup) => {
        if (!editorState) return;
        try {
            const sourceGraph = await graphEditMapsApi.getEditorGraph(item.mapId);
            const sourceNodes = sourceGraph.nodes.filter((n) => n.groupId === item.id);
            const sourceNodeIds = new Set(sourceNodes.map((n) => n.id));
            const sourceEdges = sourceGraph.edges.filter(
                (e) => sourceNodeIds.has(e.fromNodeId) && sourceNodeIds.has(e.toNodeId),
            );

            const newGroupId = allocateGroupId();
            const maxOrder = groups.reduce((max, g) => Math.max(max, g.sortOrder), 0);
            const newGroup: GroupData = {
                id: newGroupId,
                title: item.title,
                description: item.description,
                level: item.level,
                sortOrder: maxOrder + 1,
                topicCount: sourceNodes.length,
                completedCount: 0,
                availableCount: 0,
                progressPercent: 0,
            };

            const idMap = new Map<number, number>();
            const newTopics: Topic[] = [];
            const newNodes: EditorState['nodes'] = [];

            setGroups((prev) => [...prev, newGroup]);
            unsavedGroupIdsRef.current.add(newGroupId);
            await graphEditMapsApi.saveGraph(mapId, {
                nodes: [],
                edges: [],
                groups: [
                    {
                        id: newGroup.id,
                        title: newGroup.title,
                        description: newGroup.description,
                        level: newGroup.level,
                        sortOrder: newGroup.sortOrder,
                    },
                ],
            });
            unsavedGroupIdsRef.current.delete(newGroupId);

            for (const sn of sourceNodes) {
                const newId = allocateTempNodeId();
                idMap.set(sn.id, newId);
                const topic = await topicsApi.create({
                    title: sn.title,
                    description: sn.title,
                    groupId: newGroupId,
                });
                newTopics.push(topic);
                newNodes.push({
                    id: newId,
                    title: sn.title,
                    topicId: topic.id,
                    x: sn.x,
                    y: sn.y,
                    color: sn.color ?? '#6366f1',
                    groupId: newGroupId,
                });
            }

            const newEdges = sourceEdges.map((e) => ({
                id: allocateTempEdgeId(),
                fromNodeId: idMap.get(e.fromNodeId)!,
                toNodeId: idMap.get(e.toNodeId)!,
                type: e.type ?? 'prerequisite',
            }));

            setTopics((prev) => [...prev, ...newTopics]);
            updateEditorState((prev) =>
                prev
                    ? {
                          ...prev,
                          nodes: [...prev.nodes, ...newNodes],
                          edges: [...prev.edges, ...newEdges],
                      }
                    : prev,
            );
            for (const n of newNodes) {
                dirtyNodeIdsRef.current.add(n.id);
            }
            setActiveGroupId(newGroupId);
            markDirty();
            setStatusMsg(`Групу «${item.title}» додано`);
        } catch (e) {
            setStatusMsg(parseApiError(e));
        }
    };

    const handleImportNode = async (item: ImportLibraryNode, targetGroupId: string | null) => {
        if (!editorState || !targetGroupId) return;
        try {
            await ensureGroupsPersisted([targetGroupId]);
            const sourceGraph = await graphEditMapsApi.getEditorGraph(item.mapId);
            const sourceNode = sourceGraph.nodes.find((n) => n.id === item.id);
            if (!sourceNode) {
                setStatusMsg('Вузол не знайдено на вихідній карті');
                return;
            }

            const newId = allocateTempNodeId();
            const topic = await topicsApi.create({
                title: sourceNode.title,
                description: sourceNode.title,
                groupId: targetGroupId,
            });
            setTopics((prev) => [...prev, topic]);

            const groupNodes = editorState.nodes.filter((n) => n.groupId === targetGroupId);
            const pos = {
                x: (groupNodes.length % 4) * 180,
                y: Math.floor(groupNodes.length / 4) * 120,
            };

            updateEditorState((prev) =>
                prev
                    ? {
                          ...prev,
                          nodes: [
                              ...prev.nodes,
                              {
                                  id: newId,
                                  title: sourceNode.title,
                                  topicId: topic.id,
                                  x: sourceNode.x ?? pos.x,
                                  y: sourceNode.y ?? pos.y,
                                  color: sourceNode.color ?? '#6366f1',
                                  groupId: targetGroupId,
                              },
                          ],
                      }
                    : prev,
            );
            dirtyNodeIdsRef.current.add(newId);
            markDirty();
            setStatusMsg(`Вузол «${sourceNode.title}» додано`);
        } catch (e) {
            setStatusMsg(parseApiError(e));
        }
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
            await ensureGroupsPersisted([selectedGroupId]);
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

    const handleDeleteNode = (nodeId: number) => {
        if (!editorState) return;
        if (nodeId > 0) {
            setDeletedNodeIds((prev) => [...prev, nodeId]);
        }
        updateEditorState((prev) =>
            prev
                ? {
                      ...prev,
                      nodes: prev.nodes.filter((n) => n.id !== nodeId),
                      edges: prev.edges.filter(
                          (e) => e.fromNodeId !== nodeId && e.toNodeId !== nodeId,
                      ),
                  }
                : prev,
        );
        if (activeNodeId === nodeId) {
            setActiveNodeId(null);
        }
        markDirty();
    };

    const handleDeleteActiveNode = () => {
        if (activeNodeId == null) return;
        handleDeleteNode(activeNodeId);
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
                        <MapGraphValidationBadge map={map} />
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
                                <span
                                    className={`badge badge-xs ${
                                        validation.valid
                                            ? validation.warnings.length > 0
                                                ? 'badge-warning'
                                                : 'badge-success'
                                            : 'badge-error'
                                    }`}
                                >
                                    {validation.valid
                                        ? validation.warnings.length > 0
                                            ? `${validation.warnings.length} застер.`
                                            : 'OK ✓'
                                        : `${validation.errors.length} помилок`}
                                </span>
                            )}
                        </div>

                        {viewScope === 'groups' && (
                            <>
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleAddGroup}
                                >
                                    + Група
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setShowLibraryPanel(true)}
                                >
                                    Бібліотека
                                </button>
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
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={() => setShowLibraryPanel(true)}
                                >
                                    Бібліотека
                                </button>
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
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowRevisionsPanel(true)}
                        >
                            Версії
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={jsonBusy}
                            onClick={() => void handleExportJson()}
                        >
                            {jsonBusy ? '...' : 'JSON ↓'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={jsonBusy}
                            onClick={() => importJsonInputRef.current?.click()}
                        >
                            JSON ↑
                        </button>
                        <input
                            ref={importJsonInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                void handleImportJsonFile(file);
                            }}
                        />
                        <button
                            type="button"
                            className={`btn btn-outline btn-sm ${validation && rightPanelTab === 'validation' && showRightPanel ? 'btn-active' : ''}`}
                            onClick={() => {
                                if (validation) {
                                    setShowRightPanel(true);
                                    setRightPanelTab('validation');
                                } else {
                                    void handleValidate();
                                }
                            }}
                            disabled={validating}
                        >
                            {validating ? '...' : validation && !validation.valid
                                ? `Валідація (${validation.errors.length})`
                                : 'Валідувати'}
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
                            onClick={() => void handlePublish()}
                            disabled={
                                publishing ||
                                saving ||
                                (map?.status === 'published' && !dirty)
                            }
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
                          ? 'Теми: клік початковий → клік кінцевий вузол · Del — видалити вузол/ребро · «Зберегти»'
                          : 'Теми: клік — обрати вузол · клік стрілки — обрати ребро · Del — видалити · «Зʼєднання ✓» — нове ребро'}
                </p>

                {statusMsg && (
                    <p className="text-xs text-center opacity-60 max-w-2xl mx-auto truncate" title={statusMsg}>
                        {statusMsg}
                    </p>
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
                                onNodeClick={(nodeId) => {
                                    setActiveNodeId(nodeId);
                                    setRightPanelTab('properties');
                                    setShowRightPanel(true);
                                }}
                                onConnectSourceChange={setConnectSourceId}
                                onConnectSourceGroupChange={setConnectSourceGroupId}
                                onConnectNodes={handleConnectNodes}
                                onConnectGroups={handleConnectGroups}
                                onEdgesDelete={handleEdgesDelete}
                                onGroupEdgesDelete={handleGroupEdgesDelete}
                                onNodeDelete={handleDeleteNode}
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

                {showRightAside && (
                    <aside className="w-80 shrink-0 border-l border-base-content/10 bg-base-100/50 flex flex-col max-h-full">
                        <div className="p-3 border-b border-base-content/5 flex justify-between items-center gap-2">
                            {validation ? (
                                <div className="flex gap-1 flex-1 min-w-0">
                                    <button
                                        type="button"
                                        className={`btn btn-xs flex-1 ${rightPanelTab === 'properties' ? 'btn-secondary' : 'btn-ghost'}`}
                                        onClick={() => setRightPanelTab('properties')}
                                    >
                                        {viewScope === 'groups' ? 'Група' : 'Властивості'}
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn btn-xs flex-1 ${rightPanelTab === 'validation' ? 'btn-secondary' : 'btn-ghost'} ${!validation.valid ? 'text-error' : ''}`}
                                        onClick={() => setRightPanelTab('validation')}
                                    >
                                        Валідація
                                        {!validation.valid && (
                                            <span className="ml-1 opacity-70">
                                                ({validation.errors.length})
                                            </span>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <p className="text-[10px] uppercase tracking-widest opacity-40 font-display font-semibold">
                                    {rightPanelLabel}
                                </p>
                            )}
                            <button
                                type="button"
                                className="btn btn-ghost btn-xs shrink-0"
                                onClick={() => setShowRightPanel(false)}
                            >
                                ×
                            </button>
                        </div>

                        {showValidationSidePanel ? (
                            <EditorValidationPanel
                                validation={validation}
                                onNodeClick={handleValidationNodeClick}
                            />
                        ) : viewScope === 'groups' && activeGroup ? (
                            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                                <label className="form-control w-full">
                                    <span className="label-text text-xs opacity-60">Назва</span>
                                    <input
                                        type="text"
                                        className="input input-sm input-bordered w-full"
                                        value={activeGroup.title}
                                        spellCheck={false}
                                        onChange={(e) => handleGroupPatch({ title: e.target.value })}
                                    />
                                </label>
                                <label className="form-control w-full">
                                    <span className="label-text text-xs opacity-60">Опис</span>
                                    <textarea
                                        className="textarea textarea-sm textarea-bordered w-full min-h-[80px]"
                                        value={activeGroup.description ?? ''}
                                        spellCheck={false}
                                        autoCorrect="off"
                                        onChange={(e) =>
                                            handleGroupPatch({
                                                description: e.target.value || null,
                                            })
                                        }
                                    />
                                </label>
                                <p className="text-xs opacity-50">
                                    {activeGroup.topicCount} вузлів у групі
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm w-full"
                                    onClick={() => handleOpenGroup(activeGroup.id)}
                                >
                                    Деталізація →
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-error btn-outline btn-sm w-full"
                                    onClick={handleDeleteGroup}
                                >
                                    Видалити групу
                                </button>
                            </div>
                        ) : viewScope === 'groups' ? (
                            <div className="p-4 flex-1 flex items-center justify-center">
                                <p className="text-xs opacity-50 text-center">
                                    Оберіть групу на карті, щоб редагувати властивості.
                                </p>
                            </div>
                        ) : viewScope === 'topics' ? (
                            <NodeEditorPanel
                                node={activeNode}
                                nodeKey={activeNodeId}
                                topics={topics}
                                onChange={handleNodePatch}
                                onDelete={handleDeleteActiveNode}
                            />
                        ) : null}
                    </aside>
                )}

                {!showRightPanel && canShowRightAside && (
                    <button
                        type="button"
                        className="absolute right-2 top-2 btn btn-xs btn-ghost bg-base-100/90 z-10"
                        onClick={() => setShowRightPanel(true)}
                    >
                        ← {rightPanelLabel}
                    </button>
                )}
            </div>

            <EditorLibraryPanel
                mapId={mapId}
                open={showLibraryPanel}
                onClose={() => setShowLibraryPanel(false)}
                onImportGroup={handleImportGroup}
                onImportNode={handleImportNode}
                defaultTargetGroupId={selectedGroupId ?? activeGroupId}
                currentGroups={resolvedGroups.map((g) => ({ id: g.id, title: g.title }))}
            />

            <EditorRevisionsPanel
                mapId={mapId}
                open={showRevisionsPanel}
                dirty={dirty}
                onClose={() => setShowRevisionsPanel(false)}
                onRestored={handleRestoredFromRevision}
            />
        </div>
    );
}
