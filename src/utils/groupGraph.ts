import type { NodeData, EdgeData, GroupData, GroupEdgeData } from '../components/Graph/Graph';
import { layoutGroupGraphByEdges, layoutTopicGraphByEdges } from './graphLayout';

function humanizeGroupId(id: string): string {
    return id
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/** Якщо API не повернув groups — збираємо з groupId тем */
export function deriveGroupsFromNodes(nodes: NodeData[]): GroupData[] {
    const byGroup = new Map<string, NodeData[]>();

    for (const node of nodes) {
        if (!node.groupId) continue;
        const list = byGroup.get(node.groupId) ?? [];
        list.push(node);
        byGroup.set(node.groupId, list);
    }

    return [...byGroup.entries()]
        .map(([id, groupNodes]) => {
            const completed = groupNodes.filter((n) => n.status === 'completed').length;
            const available = groupNodes.filter((n) => n.status === 'available').length;
            const total = groupNodes.length;
            const level = Math.min(...groupNodes.map((n) => n.level ?? 0));

            return {
                id,
                title: humanizeGroupId(id),
                description: null,
                level,
                sortOrder: level * 1000 + (groupNodes[0]?.orderInGroup ?? 0),
                topicCount: total,
                completedCount: completed,
                availableCount: available,
                progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
            };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'uk'));
}

/** Міжгрупові ребра з node edges (fallback) */
export function deriveGroupEdgesFromNodes(
    nodes: NodeData[],
    edges: EdgeData[],
): GroupEdgeData[] {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    const result: GroupEdgeData[] = [];

    for (const edge of edges) {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from?.groupId || !to?.groupId || from.groupId === to.groupId) continue;

        const key = `${from.groupId}->${to.groupId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ from: from.groupId, to: to.groupId, type: 'cross' });
    }

    return result;
}

export const GROUP_NODE_PREFIX = '__group_';

export function groupNodeId(groupId: string): string {
    return `${GROUP_NODE_PREFIX}${groupId}`;
}

export function isGroupNodeId(id: number | string): boolean {
    return String(id).startsWith(GROUP_NODE_PREFIX);
}

export function groupIdFromNodeId(id: string): string {
    return id.slice(GROUP_NODE_PREFIX.length);
}

const TOPIC_LABEL_MAX = 52;

function truncateTopicLabel(label: string, max = TOPIC_LABEL_MAX): string {
    const trimmed = label.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1)}…`;
}

function topicLabelFont(isDark: boolean) {
    return {
        size: 12,
        color: isDark ? '#e2e8f0' : '#334155',
        face: 'DM Sans, system-ui, sans-serif',
        align: 'center' as const,
        background: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(248, 250, 252, 0.88)',
        strokeWidth: 2,
        strokeColor: isDark ? '#0f172a' : '#ffffff',
    };
}

/** Групи, що стосуються цієї карти (є теми або звʼязки між ними) */
export function filterGroupsForMap(
    groups: GroupData[],
    groupEdges: GroupEdgeData[],
    nodeGroupIds: Iterable<string | null | undefined>,
): GroupData[] {
    const onMap = new Set<string>();
    for (const gid of nodeGroupIds) {
        if (gid) onMap.add(gid);
    }

    const relevant = new Set(onMap);
    for (const e of groupEdges) {
        if (onMap.has(e.from) || onMap.has(e.to)) {
            relevant.add(e.from);
            relevant.add(e.to);
        }
    }

    if (relevant.size === 0) return groups;

    return groups
        .filter((g) => relevant.has(g.id))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'uk'));
}

export function filterGroupEdgesForGroups(
    groupEdges: GroupEdgeData[],
    groupIds: Set<string>,
): GroupEdgeData[] {
    return groupEdges.filter((e) => groupIds.has(e.from) && groupIds.has(e.to));
}

/** Зливає збережені/перетягнуті координати груп у список для графа та bulk-save */
export function mergeGroupLayouts(
    groups: GroupData[],
    overrides: Record<string, { x: number; y: number }>,
): GroupData[] {
    if (Object.keys(overrides).length === 0) return groups;

    const byId = new Map(groups.map((g) => [g.id, g]));
    const merged = groups.map((g) => {
        const pos = overrides[g.id];
        if (!pos) return g;
        return { ...g, x: pos.x, y: pos.y };
    });

    for (const [id, pos] of Object.entries(overrides)) {
        if (byId.has(id)) continue;
        merged.push({
            id,
            title: humanizeGroupId(id),
            description: null,
            level: 0,
            sortOrder: 0,
            topicCount: 0,
            completedCount: 0,
            availableCount: 0,
            progressPercent: 0,
            x: pos.x,
            y: pos.y,
        });
    }

    return merged;
}

/** Розкладка груп за sortOrder (компактні рядки, без сирих g.level з БД) */
function layoutGroupsByLevel(
    groups: GroupData[],
    yOffset = 0,
): Map<string, { x: number; y: number }> {
    const levelStep = 132;
    const rowStep = 228;
    const positions = new Map<string, { x: number; y: number }>();

    const sorted = [...groups].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'uk'),
    );

    const span = Math.max(0, (sorted.length - 1) * rowStep);
    sorted.forEach((g, index) => {
        positions.set(g.id, {
            x: Math.round(sorted.length > 1 ? index * rowStep - span / 2 : 0),
            y: Math.round(yOffset + index * levelStep),
        });
    });

    return positions;
}

/** Теми однієї групи — збережені x/y або ієрархія за ребрами (працює і з циклами) */
export function layoutTopicsInGroup(
    nodes: NodeData[],
    edges: EdgeData[] = [],
    _options: { editMode?: boolean } = {},
): Map<number, { x: number; y: number }> {
    if (nodes.length === 0) return new Map();

    const nodeIds = nodes.map((n) => n.id);
    const graphEdges = edges.map((e) => ({ from: e.from, to: e.to }));
    const sortKeys = new Map<number, number>(
        nodes.map((n) => [n.id, n.orderInGroup ?? n.globalOrder ?? 0]),
    );
    const autoLayout = layoutTopicGraphByEdges(nodeIds, graphEdges, sortKeys);

    const positions = new Map<number, { x: number; y: number }>();
    for (const n of nodes) {
        if (n.x != null && n.y != null) {
            positions.set(n.id, { x: n.x, y: n.y });
        } else {
            positions.set(n.id, autoLayout.get(n.id) ?? { x: 0, y: 0 });
        }
    }
    return positions;
}

function storedGroupPos(g: GroupData): { x: number; y: number } | undefined {
    if (g.x != null && g.y != null) return { x: g.x, y: g.y };
    return undefined;
}

/** Групи — збережені x/y або ієрархія за groupEdges */
export function layoutGroups(
    groups: GroupData[],
    groupEdges: GroupEdgeData[] = [],
    _options: { editMode?: boolean } = {},
): Map<string, { x: number; y: number }> {
    if (groups.length === 0) return new Map();
    if (groups.length === 1) {
        const g = groups[0];
        return new Map([[g.id, storedGroupPos(g) ?? { x: 0, y: 0 }]]);
    }

    const linkedIds = new Set<string>();
    for (const e of groupEdges) {
        linkedIds.add(e.from);
        linkedIds.add(e.to);
    }

    const linkedGroups = groups.filter((g) => linkedIds.has(g.id));
    const soloGroups = groups.filter((g) => !linkedIds.has(g.id));

    const positions = new Map<string, { x: number; y: number }>();

    if (linkedGroups.length > 0) {
        const linkedEdges = groupEdges.filter(
            (e) => linkedIds.has(e.from) && linkedIds.has(e.to),
        );
        const sortKeys = new Map<string, number>(
            linkedGroups.map((g) => [g.id, g.sortOrder ?? g.level * 1000]),
        );
        const hierarchical = layoutGroupGraphByEdges(
            linkedGroups.map((g) => g.id),
            linkedEdges.map((e) => ({ from: e.from, to: e.to })),
            sortKeys,
        );

        let maxY = 0;
        for (const g of linkedGroups) {
            const pos = storedGroupPos(g) ?? hierarchical.get(g.id) ?? { x: 0, y: 0 };
            positions.set(g.id, pos);
            maxY = Math.max(maxY, pos.y);
        }

        if (soloGroups.length > 0) {
            const soloPos = layoutGroupsByLevel(soloGroups, maxY + 148);
            for (const g of soloGroups) {
                positions.set(g.id, storedGroupPos(g) ?? soloPos.get(g.id) ?? { x: 0, y: 0 });
            }
        }
    } else {
        for (const g of groups) {
            const stored = storedGroupPos(g);
            if (stored) positions.set(g.id, stored);
        }
        if (positions.size < groups.length) {
            const auto = layoutGroupsByLevel(groups);
            for (const g of groups) {
                if (!positions.has(g.id)) {
                    positions.set(g.id, auto.get(g.id) ?? { x: 0, y: 0 });
                }
            }
        }
    }

    for (const g of groups) {
        if (!positions.has(g.id)) {
            positions.set(g.id, { x: 0, y: 0 });
        }
    }

    return positions;
}

/** Групи без міжгрупових ребер — «хвіст», не орієнтир для fit */
export function getSoloGroupIds(
    groups: GroupData[],
    groupEdges: GroupEdgeData[],
): Set<string> {
    const linked = new Set<string>();
    for (const e of groupEdges) {
        linked.add(e.from);
        linked.add(e.to);
    }
    return new Set(groups.filter((g) => !linked.has(g.id)).map((g) => g.id));
}

const SELECTED_BORDER = '#f59e0b';
const CONNECT_SOURCE_BORDER = '#f59e0b';

function editorTopicColor(
    hex: string,
    isActive: boolean,
    isConnectSource = false,
) {
    const border = isConnectSource
        ? CONNECT_SOURCE_BORDER
        : isActive
          ? SELECTED_BORDER
          : hex;
    return {
        background: hex,
        border,
        highlight: {
            background: hex,
            border: isConnectSource || isActive ? CONNECT_SOURCE_BORDER : '#ffffff',
        },
    };
}

function topicColor(
    status: NodeData['status'],
    isActive: boolean,
    isConnectSource = false,
) {
    const background =
        status === 'completed' ? '#6366f1' : status === 'available' ? '#10b981' : '#64748b';
    const border = isConnectSource
        ? CONNECT_SOURCE_BORDER
        : isActive
          ? SELECTED_BORDER
          : status === 'completed'
            ? '#818cf8'
            : status === 'available'
              ? '#34d399'
              : '#94a3b8';

    return {
        background,
        border,
        highlight: {
            background,
            border: isConnectSource || isActive ? CONNECT_SOURCE_BORDER : '#ffffff',
        },
        opacity: status === 'locked' ? 0.55 : 1,
    };
}

export function styledTopicNodes(
    nodes: NodeData[],
    positions: Map<number, { x: number; y: number }>,
    activeNodeId: number | null,
    isDark = false,
    connectSourceId: number | null = null,
    editMode = false,
) {
    return nodes.map((node) => {
        const isActive = activeNodeId != null && node.id === activeNodeId;
        const isConnectSource = connectSourceId != null && node.id === connectSourceId;
        const pos = positions.get(node.id);
        const label = truncateTopicLabel(node.label || node.title);
        const item: Record<string, unknown> = {
            id: node.id,
            label,
            title: editMode
                ? `${node.title}${isActive ? '\n★ обрано' : ''}${isConnectSource ? '\n→ початок ребра' : ''}`
                : `${node.title}\n${statusLabel(node.status)}${isActive ? '\n★ обрано' : ''}${isConnectSource ? '\n→ початок ребра' : ''}`,
            color: editMode
                ? editorTopicColor(node.color ?? '#6366f1', isActive, isConnectSource)
                : topicColor(node.status, isActive, isConnectSource),
            size: isActive || isConnectSource ? 16 : 12,
            borderWidth: isActive || isConnectSource ? 3 : 1.5,
            font: topicLabelFont(isDark),
            margin: { top: 2, right: 6, bottom: 12, left: 6 },
            labelHighlightBold: false,
        };
        if (editMode) {
            if (pos?.x != null && pos?.y != null) {
                item.x = pos.x;
                item.y = pos.y;
            }
            item.fixed = false;
        } else {
            item.x = pos?.x;
            item.y = pos?.y;
            item.fixed = { x: true, y: true };
        }
        return item;
    });
}

export function styledTopicEdges(edges: EdgeData[], editMode = false) {
    return edges.map((e) => ({
        id: `${e.from}-${e.to}`,
        from: e.from,
        to: e.to,
        width: editMode ? 4 : 2,
        selectionWidth: editMode ? 6 : 2,
        smooth: { enabled: true, type: 'cubicBezier', roundness: 0.2 },
        color: {
            color: '#818cf8',
            highlight: '#f59e0b',
            hover: '#c7d2fe',
            opacity: editMode ? 0.95 : 0.85,
        },
        arrows: { to: { enabled: true, scaleFactor: editMode ? 0.75 : 0.65, type: 'arrow' } },
    }));
}

const GROUP_TITLE_MAX = 34;

function truncateGroupTitle(title: string, max = GROUP_TITLE_MAX): string {
    const trimmed = title.trim();
    if (trimmed.length <= max) return trimmed;
    const slice = trimmed.slice(0, max - 1);
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > max * 0.55) return `${slice.slice(0, lastSpace)}…`;
    return `${slice}…`;
}

function groupStatusLine(g: GroupData, editMode = false): string {
    if (editMode) {
        return g.topicCount > 0 ? `${g.topicCount} тем` : 'немає тем';
    }
    if (g.topicCount > 0 && g.completedCount === g.topicCount) {
        return `✓ ${g.topicCount} тем · 100%`;
    }
    if (g.availableCount > 0) {
        return `${g.topicCount} тем · ${g.progressPercent}%`;
    }
    if (g.topicCount === 0) return 'немає тем';
    return `${g.topicCount} тем · заблоковано`;
}

function groupNodeColors(
    g: GroupData,
    isDark: boolean,
    isActive = false,
    isConnectSource = false,
    editMode = false,
) {
    if (editMode) {
        if (isConnectSource) {
            return {
                background: isDark ? '#c2410c' : '#ea580c',
                border: CONNECT_SOURCE_BORDER,
                highlight: {
                    background: isDark ? '#ea580c' : '#f97316',
                    border: '#ffffff',
                },
            };
        }
        if (isActive) {
            return {
                background: isDark ? '#4338ca' : '#6366f1',
                border: '#ffffff',
                highlight: {
                    background: isDark ? '#6366f1' : '#818cf8',
                    border: '#ffffff',
                },
            };
        }
        return {
            background: isDark ? '#334155' : '#f1f5f9',
            border: isDark ? '#6366f1' : '#4f46e5',
            highlight: {
                background: isDark ? '#475569' : '#e2e8f0',
                border: '#ffffff',
            },
        };
    }

    const complete = g.topicCount > 0 && g.completedCount === g.topicCount;
    const available = g.availableCount > 0;

    if (isConnectSource) {
        return {
            background: isDark ? '#c2410c' : '#ea580c',
            border: CONNECT_SOURCE_BORDER,
            highlight: {
                background: isDark ? '#ea580c' : '#f97316',
                border: '#ffffff',
            },
        };
    }

    if (isActive) {
        return {
            background: isDark ? '#4338ca' : '#6366f1',
            border: '#ffffff',
            highlight: {
                background: isDark ? '#6366f1' : '#818cf8',
                border: '#ffffff',
            },
        };
    }

    if (complete) {
        return {
            background: isDark ? '#4338ca' : '#6366f1',
            border: isDark ? '#a5b4fc' : '#4f46e5',
            highlight: {
                background: isDark ? '#6366f1' : '#818cf8',
                border: '#ffffff',
            },
        };
    }

    if (available) {
        return {
            background: isDark ? '#047857' : '#10b981',
            border: isDark ? '#6ee7b7' : '#059669',
            highlight: {
                background: isDark ? '#10b981' : '#34d399',
                border: '#ffffff',
            },
        };
    }

    return {
        background: isDark ? '#334155' : '#64748b',
        border: isDark ? '#64748b' : '#475569',
        highlight: {
            background: isDark ? '#475569' : '#94a3b8',
            border: '#ffffff',
        },
        opacity: 0.88,
    };
}

function groupLabelFont(
    isDark: boolean,
    editMode: boolean,
    isActive: boolean,
    isConnectSource: boolean,
) {
    let color = '#f8fafc';
    if (editMode) {
        color = isActive || isConnectSource ? '#ffffff' : isDark ? '#e2e8f0' : '#1e293b';
    }

    return {
        size: 14,
        color,
        face: 'DM Sans, system-ui, sans-serif',
        align: 'center' as const,
        multi: true,
    };
}

function styledGroupEdges(
    groupEdges: GroupEdgeData[],
    isDark: boolean,
    editMode = false,
): {
    id: string;
    from: string;
    to: string;
    width: number;
    dashes: number[] | boolean;
    smooth: object;
    color: object;
    arrows: object;
}[] {
    const base = isDark ? 'rgba(165, 180, 252, 0.72)' : 'rgba(79, 70, 229, 0.55)';
    const highlight = isDark ? '#c7d2fe' : '#6366f1';

    return groupEdges.map((e) => {
        const isRecommended = e.type === 'recommended_path';
        return {
            id:
                e.id != null && e.id > 0
                    ? `ge-${e.id}`
                    : `ge-${e.from}-${e.to}`,
            from: groupNodeId(e.from),
            to: groupNodeId(e.to),
            width: editMode ? (isRecommended ? 3.5 : 4.5) : isRecommended ? 1.8 : 2.4,
            selectionWidth: editMode ? 6 : 2,
            dashes: isRecommended ? [10, 8] : false,
            smooth: { enabled: true, type: 'cubicBezier', roundness: 0.2 },
            color: {
                color: base,
                highlight: editMode ? '#f59e0b' : highlight,
                hover: highlight,
                opacity: isRecommended ? 0.65 : 0.9,
            },
            arrows: { to: { enabled: true, scaleFactor: 0.72, type: 'arrow' } },
        };
    });
}

export function buildGroupSuperGraph(
    groups: GroupData[],
    groupEdges: GroupEdgeData[],
    isDark = false,
    activeGroupId: string | null = null,
    connectSourceGroupId: string | null = null,
    editMode = false,
    positionsOverride?: Map<string, { x: number; y: number }>,
): { nodes: object[]; edges: object[] } {
    const positions =
        positionsOverride ??
        layoutGroups(groups, groupEdges, { editMode });

    const visNodes = groups.map((g) => {
        const pos = positions.get(g.id)!;
        const title = truncateGroupTitle(g.title);
        const isActive = activeGroupId != null && g.id === activeGroupId;
        const isConnectSource = connectSourceGroupId != null && g.id === connectSourceGroupId;

        const node: Record<string, unknown> = {
            id: groupNodeId(g.id),
            label: editMode ? title : `${title}\n${groupStatusLine(g, false)}`,
            title: editMode
                ? `${g.title}\n${g.description ?? ''}\n\n${groupStatusLine(g, true)}\nРівень ${g.level + 1}${
                      isConnectSource
                          ? '\n\n→ початок ребра'
                          : isActive
                            ? '\n\n★ обрано'
                            : '\n\nКлік — обрати · «Зʼєднання ✓» — ребро · перетягнути'
                  }`
                : `${g.title}\n${g.description ?? ''}\n\n${groupStatusLine(g, false)}\nРівень ${g.level + 1}${
                      isActive ? '\n\n★ обрано' : '\n\nКлік — відкрити групу'
                  }`,
            x: pos.x,
            y: pos.y,
            shape: 'box' as const,
            shapeProperties: { borderRadius: 12 },
            widthConstraint: { minimum: 200, maximum: 248 },
            heightConstraint: { minimum: 80, valign: 'middle' as const },
            font: groupLabelFont(isDark, editMode, isActive, isConnectSource),
            color: groupNodeColors(g, isDark, isActive, isConnectSource, editMode),
            borderWidth: isActive || isConnectSource ? 3 : 2,
            margin: { top: 10, right: 12, bottom: 10, left: 12 },
            shadow: {
                enabled: true,
                color: isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(79, 70, 229, 0.18)',
                size: 12,
                x: 0,
                y: 3,
            },
            labelHighlightBold: false,
        };
        if (editMode) {
            node.fixed = false;
        } else {
            node.fixed = { x: true, y: true };
        }
        return node;
    });

    return {
        nodes: visNodes,
        edges: styledGroupEdges(groupEdges, isDark, editMode),
    };
}

export function patchGroupHighlight(
    nodesDS: { update: (items: object | object[]) => void },
    groups: GroupData[],
    activeGroupId: string | null,
    prevActiveGroupId: string | null,
    connectSourceGroupId: string | null,
    isDark: boolean,
    editMode = false,
) {
    const updates: object[] = [];

    const idsToReset = new Set<string>();
    if (prevActiveGroupId != null && prevActiveGroupId !== activeGroupId) {
        idsToReset.add(prevActiveGroupId);
    }
    if (
        connectSourceGroupId != null &&
        connectSourceGroupId !== activeGroupId &&
        connectSourceGroupId !== prevActiveGroupId
    ) {
        /* keep connect source styled separately */
    }

    for (const id of idsToReset) {
        const g = groups.find((group) => group.id === id);
        if (g) {
            updates.push({
                id: groupNodeId(id),
                color: groupNodeColors(g, isDark, false, false, editMode),
                borderWidth: 2,
            });
        }
    }

    if (activeGroupId != null) {
        const g = groups.find((group) => group.id === activeGroupId);
        if (g) {
            const isConnectSource = connectSourceGroupId === activeGroupId;
            updates.push({
                id: groupNodeId(activeGroupId),
                color: groupNodeColors(g, isDark, !isConnectSource, isConnectSource, editMode),
                borderWidth: 3,
            });
        }
    }

    if (connectSourceGroupId != null && connectSourceGroupId !== activeGroupId) {
        const g = groups.find((group) => group.id === connectSourceGroupId);
        if (g) {
            updates.push({
                id: groupNodeId(connectSourceGroupId),
                color: groupNodeColors(g, isDark, false, true, editMode),
                borderWidth: 3,
            });
        }
    }

    if (updates.length > 0) nodesDS.update(updates);
}

export function filterGraphByGroup(
    nodes: NodeData[],
    edges: EdgeData[],
    groupId: string,
): { nodes: NodeData[]; edges: EdgeData[] } {
    const filteredNodes = nodes.filter((n) => n.groupId === groupId);
    const ids = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    return { nodes: filteredNodes, edges: filteredEdges };
}

function statusLabel(status: NodeData['status']) {
    if (status === 'completed') return 'завершено';
    if (status === 'available') return 'доступно';
    return 'заблоковано';
}

export function patchTopicHighlight(
    nodesDS: { update: (items: object | object[]) => void },
    allNodes: NodeData[],
    activeNodeId: number | null,
    prevActiveId: number | null,
    connectSourceId: number | null = null,
    editMode = false,
) {
    const updates: object[] = [];

    const idsToReset = new Set<number>();
    if (prevActiveId != null && prevActiveId !== activeNodeId) idsToReset.add(prevActiveId);

    for (const id of idsToReset) {
        const prev = allNodes.find((n) => n.id === id);
        if (prev) {
            updates.push({
                id,
                color: editMode
                    ? editorTopicColor(prev.color ?? '#6366f1', false, false)
                    : topicColor(prev.status, false, false),
                size: 12,
                borderWidth: 1.5,
            });
        }
    }

    if (activeNodeId != null) {
        const curr = allNodes.find((n) => n.id === activeNodeId);
        if (curr) {
            const isConnectSource = connectSourceId === activeNodeId;
            updates.push({
                id: activeNodeId,
                color: editMode
                    ? editorTopicColor(curr.color ?? '#6366f1', !isConnectSource, isConnectSource)
                    : topicColor(curr.status, !isConnectSource, isConnectSource),
                size: 16,
                borderWidth: 3,
                label: truncateTopicLabel(curr.label || curr.title),
            });
        }
    }

    if (connectSourceId != null && connectSourceId !== activeNodeId) {
        const src = allNodes.find((n) => n.id === connectSourceId);
        if (src) {
            updates.push({
                id: connectSourceId,
                color: editMode
                    ? editorTopicColor(src.color ?? '#6366f1', false, true)
                    : topicColor(src.status, false, true),
                size: 16,
                borderWidth: 3,
                label: truncateTopicLabel(src.label || src.title),
            });
        }
    }

    if (updates.length > 0) nodesDS.update(updates);
}
