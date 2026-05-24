import type { NodeData, EdgeData } from '../components/Graph/Graph';

export type MapViewMode = 'overview' | 'level' | 'focus';

export function getLevelRange(nodes: { level: number }[]): number[] {
    const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
    return levels;
}

export function filterGraphForView(
    nodes: NodeData[],
    edges: EdgeData[],
    mode: MapViewMode,
    selectedLevel: number | null,
    focusNodeId: number | null,
): { nodes: NodeData[]; edges: EdgeData[] } {
    if (mode === 'overview' || nodes.length === 0) {
        return { nodes, edges };
    }

    const nodeIds = new Set<number>();

    if (mode === 'level' && selectedLevel != null) {
        const inLevel = nodes.filter((n) => n.level === selectedLevel);
        inLevel.forEach((n) => nodeIds.add(n.id));

        // контекст: сусідні рівні, з'єднані ребрами
        for (const e of edges) {
            const from = nodes.find((n) => n.id === e.from);
            const to = nodes.find((n) => n.id === e.to);
            if (!from || !to) continue;
            const touchesLevel =
                from.level === selectedLevel || to.level === selectedLevel;
            if (touchesLevel) {
                nodeIds.add(e.from);
                nodeIds.add(e.to);
            }
        }
    }

    if (mode === 'focus' && focusNodeId != null) {
        collectNeighborhood(focusNodeId, nodes, edges, nodeIds, 2);
    }

    if (nodeIds.size === 0) {
        return { nodes, edges };
    }

    const filteredNodes = nodes.filter((n) => nodeIds.has(n.id));
    const filteredEdges = edges.filter(
        (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
    );

    return { nodes: filteredNodes, edges: filteredEdges };
}

function collectNeighborhood(
    startId: number,
    nodes: NodeData[],
    edges: EdgeData[],
    out: Set<number>,
    depth: number,
) {
    out.add(startId);

    const parents = new Map<number, number[]>();
    const children = new Map<number, number[]>();
    for (const e of edges) {
        if (!children.has(e.from)) children.set(e.from, []);
        children.get(e.from)!.push(e.to);
        if (!parents.has(e.to)) parents.set(e.to, []);
        parents.get(e.to)!.push(e.from);
    }

    // предки
    let frontier = [startId];
    for (let d = 0; d < depth; d++) {
        const next: number[] = [];
        for (const id of frontier) {
            for (const p of parents.get(id) ?? []) {
                if (!out.has(p)) {
                    out.add(p);
                    next.push(p);
                }
            }
        }
        frontier = next;
    }

    // нащадки
    frontier = [startId];
    for (let d = 0; d < depth; d++) {
        const next: number[] = [];
        for (const id of frontier) {
            for (const c of children.get(id) ?? []) {
                if (!out.has(c)) {
                    out.add(c);
                    next.push(c);
                }
            }
        }
        frontier = next;
    }
}

export function searchNodes(nodes: NodeData[], query: string): NodeData[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter(
        (n) =>
            n.title.toLowerCase().includes(q) ||
            n.label.toLowerCase().includes(q),
    );
}

export function countByLevel(nodes: { level: number }[]): Record<number, number> {
    return nodes.reduce(
        (acc, n) => {
            acc[n.level] = (acc[n.level] ?? 0) + 1;
            return acc;
        },
        {} as Record<number, number>,
    );
}
