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

/** Групи — колонки за level, рядки за sortOrder */
export function layoutGroups(groups: GroupData[]): Map<string, { x: number; y: number }> {
    const levelSeparation = 220;
    const rowSpacing = 100;

    const sortedLevels = [...new Set(groups.map((g) => g.level))].sort((a, b) => a - b);
    const colOfLevel = new Map(sortedLevels.map((lv, i) => [lv, i]));

    const positions = new Map<string, { x: number; y: number }>();

    const byLevel = new Map<number, GroupData[]>();
    for (const g of groups) {
        if (!byLevel.has(g.level)) byLevel.set(g.level, []);
        byLevel.get(g.level)!.push(g);
    }

    for (const [level, list] of byLevel) {
        const col = colOfLevel.get(level) ?? 0;
        const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder);
        const span = Math.max(0, (sorted.length - 1) * rowSpacing);
        sorted.forEach((g, index) => {
            positions.set(g.id, {
                x: col * levelSeparation,
                y: index * rowSpacing - span / 2,
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

export function buildGroupSuperGraph(
    groups: GroupData[],
    groupEdges: GroupEdgeData[],
): { nodes: object[]; edges: { from: string; to: string }[] } {
    const positions = layoutGroups(groups);

    const visNodes = groups.map((g) => {
        const pos = positions.get(g.id)!;
        const bg =
            g.completedCount === g.topicCount && g.topicCount > 0
                ? '#6366f1'
                : g.availableCount > 0
                  ? '#10b981'
                  : '#64748b';

        return {
            id: groupNodeId(g.id),
            label: `${g.title}\n${g.topicCount} тем · ${g.progressPercent}%`,
            title: `${g.title}\n${g.description ?? ''}\n\n${g.topicCount} тем\n✓ ${g.completedCount} · ◐ ${g.availableCount}\n\nКлік — відкрити групу`,
            x: pos.x,
            y: pos.y,
            fixed: { x: true, y: true },
            shape: 'box' as const,
            size: Math.min(40, 22 + Math.sqrt(g.topicCount) * 2),
            font: { size: 12, color: '#f8fafc', face: 'DM Sans, system-ui, sans-serif' },
            color: {
                background: bg,
                border: '#a5b4fc',
                highlight: { background: '#818cf8', border: '#ffffff' },
            },
            borderWidth: 2,
            margin: 10,
        };
    });

    const visEdges = groupEdges.map((e) => ({
        from: groupNodeId(e.from),
        to: groupNodeId(e.to),
    }));

    return { nodes: visNodes, edges: visEdges };
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
