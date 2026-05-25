import type { NodeData } from '../components/Graph/Graph';

export const LAYOUT = {
    levelSeparation: 160,
    nodeSpacing: 44,
    originX: 0,
    originY: 0,
} as const;

export interface LevelLayoutOptions {
    levelSeparation?: number;
    nodeSpacing?: number;
    originX?: number;
    originY?: number;
    /** Колонки 0,1,2… за видимими рівнями, а не абсолютний номер L8 → x=1280 */
    normalizeColumns?: boolean;
}

/**
 * Розкладка: колонки = рівні (зліва → право), рядки = теми в колонці.
 * Повертає Map id → {x,y} у координатах vis-network (canvas space).
 */
export function layoutNodesByLevel(
    nodes: NodeData[],
    options: LevelLayoutOptions = {},
): Map<number, { x: number; y: number }> {
    const {
        levelSeparation = LAYOUT.levelSeparation,
        nodeSpacing = LAYOUT.nodeSpacing,
        originX = LAYOUT.originX,
        originY = LAYOUT.originY,
        normalizeColumns = true,
    } = options;

    if (nodes.length === 0) return new Map();

    const sortedLevels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
    const colOfLevel = new Map(sortedLevels.map((lv, i) => [lv, normalizeColumns ? i : lv]));

    const byLevel = new Map<number, NodeData[]>();
    for (const n of nodes) {
        if (!byLevel.has(n.level)) byLevel.set(n.level, []);
        byLevel.get(n.level)!.push(n);
    }

    for (const group of byLevel.values()) {
        group.sort((a, b) => a.title.localeCompare(b.title, 'uk'));
    }

    const positions = new Map<number, { x: number; y: number }>();

    for (const [level, group] of byLevel) {
        const col = colOfLevel.get(level) ?? 0;
        const span = Math.max(0, (group.length - 1) * nodeSpacing);
        group.forEach((node, index) => {
            positions.set(node.id, {
                x: originX + col * levelSeparation,
                y: originY + index * nodeSpacing - span / 2,
            });
        });
    }

    return positions;
}

export function layoutSuperNodesByLevel(
    levels: number[],
    options: Pick<LevelLayoutOptions, 'levelSeparation' | 'originX' | 'originY' | 'normalizeColumns'> = {},
): Map<string, { x: number; y: number }> {
    const {
        levelSeparation = 240,
        originX = LAYOUT.originX,
        originY = LAYOUT.originY,
        normalizeColumns = true,
    } = options;

    const sorted = [...levels].sort((a, b) => a - b);
    const colOfLevel = new Map(sorted.map((lv, i) => [lv, normalizeColumns ? i : lv]));
    const positions = new Map<string, { x: number; y: number }>();

    for (const level of sorted) {
        const col = colOfLevel.get(level) ?? 0;
        positions.set(`__super_${level}`, {
            x: originX + col * levelSeparation,
            y: originY,
        });
    }

    return positions;
}

/** Підібрати масштаб, щоб колонка вміщалась у viewport по висоті. */
export function scaleForColumn(
    nodeCount: number,
    containerHeight: number,
    nodeSpacing = LAYOUT.nodeSpacing,
): number {
    const columnHeight = Math.max(nodeCount, 1) * nodeSpacing;
    const fitScale = (containerHeight * 0.72) / columnHeight;
    return Math.min(1.5, Math.max(0.25, fitScale));
}
