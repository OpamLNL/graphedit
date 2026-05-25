import type { NodeData, EdgeData, GroupData, GroupEdgeData } from '../components/Graph/Graph';

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

const TOPIC_SPACING = 56;
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

/** Теми однієї групи — вертикальна колонка за orderInGroup */
export function layoutTopicsInGroup(nodes: NodeData[]): Map<number, { x: number; y: number }> {
    const sorted = [...nodes].sort((a, b) => (a.orderInGroup ?? 0) - (b.orderInGroup ?? 0));
    const span = Math.max(0, (sorted.length - 1) * TOPIC_SPACING);
    const positions = new Map<number, { x: number; y: number }>();

    sorted.forEach((node, index) => {
        positions.set(node.id, {
            x: 0,
            y: index * TOPIC_SPACING - span / 2,
        });
    });

    return positions;
}

/** Групи — зверху вниз за level; кілька груп на одному рівні — в ряд */
export function layoutGroups(groups: GroupData[]): Map<string, { x: number; y: number }> {
    const levelStep = 132;
    const rowStep = 228;

    const sortedLevels = [...new Set(groups.map((g) => g.level))].sort((a, b) => a - b);

    const positions = new Map<string, { x: number; y: number }>();

    const byLevel = new Map<number, GroupData[]>();
    for (const g of groups) {
        if (!byLevel.has(g.level)) byLevel.set(g.level, []);
        byLevel.get(g.level)!.push(g);
    }

    for (const level of sortedLevels) {
        const sorted = [...(byLevel.get(level) ?? [])].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'uk'),
        );
        const span = Math.max(0, (sorted.length - 1) * rowStep);
        sorted.forEach((g, index) => {
            positions.set(g.id, {
                x: index * rowStep - span / 2,
                y: level * levelStep,
            });
        });
    }

    return positions;
}

const SELECTED_BORDER = '#f59e0b';

function topicColor(status: NodeData['status'], isActive: boolean) {
    const background =
        status === 'completed' ? '#6366f1' : status === 'available' ? '#10b981' : '#64748b';
    const border = isActive
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
            border: isActive ? SELECTED_BORDER : '#ffffff',
        },
        opacity: status === 'locked' ? 0.55 : 1,
    };
}

export function styledTopicNodes(
    nodes: NodeData[],
    positions: Map<number, { x: number; y: number }>,
    activeNodeId: number | null,
    isDark = false,
) {
    return nodes.map((node) => {
        const isActive = activeNodeId != null && node.id === activeNodeId;
        const pos = positions.get(node.id);
        const label = truncateTopicLabel(node.label || node.title);
        return {
            id: node.id,
            label,
            title: `${node.title}\n${statusLabel(node.status)}${isActive ? '\n★ обрано' : ''}`,
            x: pos?.x,
            y: pos?.y,
            fixed: { x: true, y: true },
            color: topicColor(node.status, isActive),
            size: isActive ? 16 : 12,
            borderWidth: isActive ? 3 : 1.5,
            font: topicLabelFont(isDark),
            margin: { top: 2, right: 6, bottom: 12, left: 6 },
            labelHighlightBold: false,
        };
    });
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

function groupStatusLine(g: GroupData): string {
    if (g.topicCount > 0 && g.completedCount === g.topicCount) {
        return `✓ ${g.topicCount} тем · 100%`;
    }
    if (g.availableCount > 0) {
        return `${g.topicCount} тем · ${g.progressPercent}%`;
    }
    if (g.topicCount === 0) return 'немає тем';
    return `${g.topicCount} тем · заблоковано`;
}

function groupNodeColors(g: GroupData, isDark: boolean) {
    const complete = g.topicCount > 0 && g.completedCount === g.topicCount;
    const available = g.availableCount > 0;

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

function groupLabelFont() {
    return {
        size: 14,
        color: '#ffffff',
        face: 'DM Sans, system-ui, sans-serif',
        align: 'center' as const,
        multi: true,
    };
}

function styledGroupEdges(
    groupEdges: GroupEdgeData[],
    isDark: boolean,
): { from: string; to: string; width: number; dashes: number[] | boolean; smooth: object; color: object; arrows: object }[] {
    const base = isDark ? 'rgba(165, 180, 252, 0.72)' : 'rgba(79, 70, 229, 0.55)';
    const highlight = isDark ? '#c7d2fe' : '#6366f1';

    return groupEdges.map((e) => {
        const isRecommended = e.type === 'recommended_path';
        return {
            from: groupNodeId(e.from),
            to: groupNodeId(e.to),
            width: isRecommended ? 1.8 : 2.4,
            dashes: isRecommended ? [10, 8] : false,
            smooth: { enabled: true, type: 'cubicBezier', roundness: 0.42 },
            color: {
                color: base,
                highlight,
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
): { nodes: object[]; edges: object[] } {
    const positions = layoutGroups(groups);

    const visNodes = groups.map((g) => {
        const pos = positions.get(g.id)!;
        const title = truncateGroupTitle(g.title);

        return {
            id: groupNodeId(g.id),
            label: `${title}\n${groupStatusLine(g)}`,
            title: `${g.title}\n${g.description ?? ''}\n\n${groupStatusLine(g)}\nРівень ${g.level + 1}\n\nКлік — відкрити групу`,
            x: pos.x,
            y: pos.y,
            fixed: { x: true, y: true },
            shape: 'box' as const,
            shapeProperties: { borderRadius: 12 },
            widthConstraint: { minimum: 200, maximum: 248 },
            heightConstraint: { minimum: 80, valign: 'middle' as const },
            font: groupLabelFont(),
            color: groupNodeColors(g, isDark),
            borderWidth: 2,
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
    });

    return { nodes: visNodes, edges: styledGroupEdges(groupEdges, isDark) };
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
) {
    const updates: object[] = [];

    if (prevActiveId != null && prevActiveId !== activeNodeId) {
        const prev = allNodes.find((n) => n.id === prevActiveId);
        if (prev) {
            updates.push({
                id: prevActiveId,
                color: topicColor(prev.status, false),
                size: 12,
                borderWidth: 1.5,
            });
        }
    }

    if (activeNodeId != null) {
        const curr = allNodes.find((n) => n.id === activeNodeId);
        if (curr) {
            updates.push({
                id: activeNodeId,
                color: topicColor(curr.status, true),
                size: 16,
                borderWidth: 3,
                label: truncateTopicLabel(curr.label || curr.title),
            });
        }
    }

    if (updates.length > 0) nodesDS.update(updates);
}
