import type { NodeData, EdgeData } from '../components/Graph/Graph';
import { layoutNodesByLevel, layoutSuperNodesByLevel } from './levelLayout';

/** Нижче — супервузли (рівні). Вище — деталі. Між ними — гістерезис. */
export const ZOOM_SUPER_MAX = 0.42;
export const ZOOM_DETAIL_MIN = 0.52;

export type ZoomDisplayMode = 'super' | 'detail';

export function superNodeId(level: number): string {
    return `__super_${level}`;
}

export function isSuperNodeId(id: number | string): boolean {
    return String(id).startsWith('__super_');
}

export function levelFromSuperId(id: string): number {
    return Number(id.replace('__super_', ''));
}

export function resolveZoomMode(scale: number, current: ZoomDisplayMode): ZoomDisplayMode {
    if (current === 'super' && scale >= ZOOM_DETAIL_MIN) return 'detail';
    if (current === 'detail' && scale <= ZOOM_SUPER_MAX) return 'super';
    return current;
}

export interface SuperGraphNode {
    id: string;
    label: string;
    title: string;
    level: number;
    shape: 'box';
    size: number;
    font: { size: number; color: string; face: string };
    color: { background: string; border: string; highlight: { background: string; border: string } };
    borderWidth: number;
    margin: number;
}

export function buildLevelSuperGraph(
    nodes: NodeData[],
    edges: EdgeData[],
): { nodes: SuperGraphNode[]; edges: EdgeData[] } {
    const byLevel = new Map<number, NodeData[]>();
    for (const n of nodes) {
        if (!byLevel.has(n.level)) byLevel.set(n.level, []);
        byLevel.get(n.level)!.push(n);
    }

    const levels = [...byLevel.keys()].sort((a, b) => a - b);

    const superNodes: SuperGraphNode[] = levels.map((level) => {
        const group = byLevel.get(level)!;
        const completed = group.filter((n) => n.status === 'completed').length;
        const available = group.filter((n) => n.status === 'available').length;
        const total = group.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        const bg =
            completed === total
                ? '#6366f1'
                : available > 0
                  ? '#10b981'
                  : '#64748b';

        return {
            id: superNodeId(level),
            label: `Рівень ${level}\n${total} тем · ${pct}%`,
            title: `Рівень ${level}\n${total} тем\n✓ ${completed} · ◐ ${available} · 🔒 ${total - completed - available}\n\nНаблизь або клікни`,
            level,
            shape: 'box',
            size: Math.min(36, 20 + Math.sqrt(total) * 2),
            font: { size: 13, color: '#f8fafc', face: 'DM Sans, system-ui, sans-serif' },
            color: {
                background: bg,
                border: '#a5b4fc',
                highlight: { background: '#818cf8', border: '#ffffff' },
            },
            borderWidth: 3,
            margin: 12,
        };
    });

    const levelOf = new Map(nodes.map((n) => [n.id, n.level]));
    const superEdgeSet = new Set<string>();
    const superEdges: { from: string; to: string }[] = [];

    for (const e of edges) {
        const fl = levelOf.get(e.from);
        const tl = levelOf.get(e.to);
        if (fl == null || tl == null || fl === tl) continue;
        const key = `${fl}->${tl}`;
        if (superEdgeSet.has(key)) continue;
        superEdgeSet.add(key);
        superEdges.push({ from: superNodeId(fl), to: superNodeId(tl) });
    }

    const superPositions = layoutSuperNodesByLevel(levels);

    const positionedSuperNodes = superNodes.map((node) => {
        const pos = superPositions.get(node.id)!;
        return {
            ...node,
            x: pos.x,
            y: pos.y,
        };
    });

    return { nodes: positionedSuperNodes, edges: superEdges };
}

const SELECTED_COLOR = {
    background: '#f59e0b',
    border: '#ffffff',
    highlight: { background: '#fbbf24', border: '#ffffff' },
    hover: { background: '#fb923c', border: '#ffffff' },
} as const;

function colorForNode(node: NodeData, isActive: boolean) {
    if (isActive) return { ...SELECTED_COLOR };

    return {
        background:
            node.status === 'completed'
                ? '#6366f1'
                : node.status === 'available'
                  ? '#10b981'
                  : '#64748b',
        border:
            node.status === 'completed'
                ? '#818cf8'
                : node.status === 'available'
                  ? '#34d399'
                  : '#94a3b8',
        highlight:
            node.status === 'completed'
                ? { background: '#a5b4fc', border: '#ffffff' }
                : node.status === 'available'
                  ? { background: '#6ee7b7', border: '#ffffff' }
                  : { background: '#cbd5e1', border: '#ffffff' },
        opacity: node.status === 'locked' ? 0.55 : 1,
    };
}

export function styledDetailNodes(
    nodes: NodeData[],
    isLarge: boolean,
    activeNodeId: number | null = null,
) {
    const positions = layoutNodesByLevel(nodes, {
        levelSeparation: isLarge ? 160 : 200,
        nodeSpacing: isLarge ? 44 : 52,
        normalizeColumns: true,
    });

    return nodes.map((node) => {
        const isActive = activeNodeId != null && node.id === activeNodeId;
        const pos = positions.get(node.id);
        return {
            id: node.id,
            label: isActive || !isLarge ? node.label : '',
            title: `${node.title}\nРівень ${node.level} · ${statusLabel(node.status)}${isActive ? '\n★ обрано' : ''}`,
            level: node.level,
            x: pos?.x,
            y: pos?.y,
            color: colorForNode(node, isActive),
            size: isActive ? (isLarge ? 16 : 28) : isLarge ? 10 : 22,
            borderWidth: isActive ? 3 : isLarge ? 1.5 : 3,
        };
    });
}

export function patchActiveNodeHighlight(
    nodesDS: { update: (items: object | object[]) => void },
    allNodes: NodeData[],
    activeNodeId: number | null,
    prevActiveId: number | null,
    isLarge: boolean,
) {
    const updates: object[] = [];

    if (prevActiveId != null && prevActiveId !== activeNodeId) {
        const prev = allNodes.find((n) => n.id === prevActiveId);
        if (prev) {
            updates.push({
                id: prevActiveId,
                color: colorForNode(prev, false),
                size: isLarge ? 10 : 22,
                borderWidth: isLarge ? 1.5 : 3,
            });
        }
    }

    if (activeNodeId != null) {
        const curr = allNodes.find((n) => n.id === activeNodeId);
        if (curr) {
            updates.push({
                id: activeNodeId,
                color: colorForNode(curr, true),
                size: isLarge ? 16 : 28,
                borderWidth: 3,
                label: curr.label,
            });
        }
    }

    if (updates.length > 0) nodesDS.update(updates);
}

function statusLabel(status: NodeData['status']) {
    if (status === 'completed') return 'завершено';
    if (status === 'available') return 'доступно';
    return 'заблоковано';
}
