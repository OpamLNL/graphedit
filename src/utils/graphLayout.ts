type GraphId = number | string;

export type GraphEdge = { from: GraphId; to: GraphId };

export type HierarchicalLayoutOptions = {
    levelSeparation?: number;
    nodeSpacing?: number;
    minNodeSpacing?: number;
};

export type LayoutSortKey = Map<GraphId, number>;

const TOPIC_LAYOUT: HierarchicalLayoutOptions = {
    levelSeparation: 80,
    nodeSpacing: 100,
    minNodeSpacing: 72,
};

const GROUP_LAYOUT: HierarchicalLayoutOptions = {
    levelSeparation: 148,
    nodeSpacing: 248,
    minNodeSpacing: 200,
};

function resolveId(nodeIds: GraphId[], key: string): GraphId | undefined {
    return nodeIds.find((id) => String(id) === key);
}

function buildAdjacency(nodeIds: GraphId[], edges: GraphEdge[]) {
    const idSet = new Set(nodeIds.map(String));
    const inEdges = new Map<string, string[]>();
    const outEdges = new Map<string, string[]>();

    for (const id of nodeIds) {
        const key = String(id);
        inEdges.set(key, []);
        outEdges.set(key, []);
    }

    const validEdges: GraphEdge[] = [];
    for (const e of edges) {
        const from = String(e.from);
        const to = String(e.to);
        if (!idSet.has(from) || !idSet.has(to) || from === to) continue;
        outEdges.get(from)!.push(to);
        inEdges.get(to)!.push(from);
        validEdges.push(e);
    }

    return { inEdges, outEdges, validEdges };
}

function isIsolated(key: string, inEdges: Map<string, string[]>, outEdges: Map<string, string[]>): boolean {
    return inEdges.get(key)!.length === 0 && outEdges.get(key)!.length === 0;
}

/** Стиснути рівні до 0..n без прогалин (1, 5, 9 → 0, 1, 2) */
function compactLevels(levels: Map<GraphId, number>): Map<GraphId, number> {
    const unique = [...new Set(levels.values())].sort((a, b) => a - b);
    const remap = new Map(unique.map((v, i) => [v, i]));
    const result = new Map<GraphId, number>();
    for (const [id, lv] of levels) {
        result.set(id, remap.get(lv) ?? 0);
    }
    return result;
}

function computeGraphLevels(
    nodeIds: GraphId[],
    edges: GraphEdge[],
): Map<GraphId, number> {
    const levels = new Map<GraphId, number>();
    const { inEdges, outEdges, validEdges } = buildAdjacency(nodeIds, edges);

    const connected = nodeIds.filter((id) => !isIsolated(String(id), inEdges, outEdges));
    if (connected.length === 0) return levels;

    const roots = connected.filter((id) => inEdges.get(String(id))!.length === 0);
    const seeds = roots.length > 0 ? roots : [connected[0]];

    for (const id of seeds) {
        levels.set(id, 0);
    }

    for (let pass = 0; pass < connected.length; pass++) {
        for (const e of validEdges) {
            const fromId = resolveId(nodeIds, String(e.from));
            const toId = resolveId(nodeIds, String(e.to));
            if (fromId == null || toId == null) continue;
            if (!levels.has(fromId)) continue;

            const next = levels.get(fromId)! + 1;
            levels.set(toId, Math.max(levels.get(toId) ?? -1, next));
        }
    }

    for (const id of connected) {
        if (!levels.has(id)) {
            levels.set(id, 0);
        }
    }

    return compactLevels(levels);
}

/**
 * Рівні для розкладки: ступінь від коренів (in-degree 0) + порядок orderInGroup.
 * Без ребер — лінійний ланцюг за sortKeys; ізольовані не «випадають» далеко вниз.
 */
export function computeLevelsFromRoots(
    nodeIds: GraphId[],
    edges: GraphEdge[],
    sortKeys?: LayoutSortKey,
): Map<GraphId, number> {
    const result = new Map<GraphId, number>();
    if (nodeIds.length === 0) return result;

    const { inEdges, outEdges } = buildAdjacency(nodeIds, edges);
    const isolated = new Set(
        nodeIds
            .filter((id) => isIsolated(String(id), inEdges, outEdges))
            .map((id) => String(id)),
    );

    const graphLevels = computeGraphLevels(nodeIds, edges);
    const sorted = sortRow(nodeIds, sortKeys);

    if (graphLevels.size === 0) {
        sorted.forEach((id, index) => result.set(id, index));
        return result;
    }

    let prev = -1;
    for (const id of sorted) {
        const isNodeIsolated = isolated.has(String(id));
        const graphLevel = graphLevels.get(id);
        const level = isNodeIsolated
            ? prev + 1
            : Math.max(graphLevel ?? 0, prev + 1);
        result.set(id, level);
        prev = level;
    }

    return compactLevels(result);
}

function sortRow(row: GraphId[], sortKeys?: LayoutSortKey): GraphId[] {
    return [...row].sort((a, b) => {
        if (sortKeys) {
            const oa = sortKeys.get(a) ?? 0;
            const ob = sortKeys.get(b) ?? 0;
            if (oa !== ob) return oa - ob;
        }
        return String(a).localeCompare(String(b), 'uk');
    });
}

function spacingForRow(rowLength: number, options: HierarchicalLayoutOptions): number {
    const base = options.nodeSpacing ?? 56;
    const min = options.minNodeSpacing ?? base;
    if (rowLength <= 3) return base;
    if (rowLength <= 6) return Math.max(min, base);
    return Math.max(min, Math.round(base * 1.15));
}

/** Початковий зверху; ступінь N — N-й ряд нижче, вузли в рядку розподілені по горizontалі */
export function layoutHierarchicalTopDown(
    nodeIds: GraphId[],
    edges: GraphEdge[],
    options: HierarchicalLayoutOptions = TOPIC_LAYOUT,
    sortKeys?: LayoutSortKey,
): Map<GraphId, { x: number; y: number }> {
    const positions = new Map<GraphId, { x: number; y: number }>();
    if (nodeIds.length === 0) return positions;

    const { levelSeparation = 80 } = options;

    if (nodeIds.length === 1) {
        positions.set(nodeIds[0], { x: 0, y: 0 });
        return positions;
    }

    const levels = computeLevelsFromRoots(nodeIds, edges, sortKeys);

    const byLevel = new Map<number, GraphId[]>();
    for (const id of nodeIds) {
        const lv = levels.get(id) ?? 0;
        if (!byLevel.has(lv)) byLevel.set(lv, []);
        byLevel.get(lv)!.push(id);
    }

    const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

    for (const lv of sortedLevels) {
        const row = sortRow(byLevel.get(lv) ?? [], sortKeys);
        const spacing = spacingForRow(row.length, options);
        const span = Math.max(0, (row.length - 1) * spacing);
        row.forEach((id, index) => {
            positions.set(id, {
                x: Math.round(index * spacing - span / 2),
                y: Math.round(lv * levelSeparation),
            });
        });
    }

    return positions;
}

/** Ізольовані / хвостові вузли — не враховувати при першому fit */
export function isolatedNodeIds(nodeIds: GraphId[], edges: GraphEdge[]): Set<string> {
    const { inEdges, outEdges } = buildAdjacency(nodeIds, edges);
    const result = new Set<string>();
    for (const id of nodeIds) {
        if (isIsolated(String(id), inEdges, outEdges)) {
            result.add(String(id));
        }
    }
    return result;
}

export function layoutTopicGraphByEdges(
    nodeIds: number[],
    edges: GraphEdge[],
    sortKeys?: LayoutSortKey,
): Map<number, { x: number; y: number }> {
    const raw = layoutHierarchicalTopDown(nodeIds, edges, TOPIC_LAYOUT, sortKeys);
    const result = new Map<number, { x: number; y: number }>();
    for (const [id, pos] of raw) {
        result.set(Number(id), pos);
    }
    return result;
}

export function layoutGroupGraphByEdges(
    groupIds: string[],
    edges: GraphEdge[],
    sortKeys?: LayoutSortKey,
): Map<string, { x: number; y: number }> {
    const raw = layoutHierarchicalTopDown(groupIds, edges, GROUP_LAYOUT, sortKeys);
    const result = new Map<string, { x: number; y: number }>();
    for (const [id, pos] of raw) {
        result.set(String(id), pos);
    }
    return result;
}
