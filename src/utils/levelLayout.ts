import type { NodeData } from '../components/Graph/Graph';

export interface LevelLayoutOptions {
    levelSeparation?: number;
    nodeSpacing?: number;
    originX?: number;
}

/** Колонки зліва направо за рівнем — передбачувані координати для vis-network. */
export function layoutNodesByLevel(
    nodes: NodeData[],
    options: LevelLayoutOptions = {},
): Map<number, { x: number; y: number }> {
    const { levelSeparation = 200, nodeSpacing = 40, originX = 100 } = options;

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
        const span = (group.length - 1) * nodeSpacing;
        group.forEach((node, index) => {
            positions.set(node.id, {
                x: originX + level * levelSeparation,
                y: index * nodeSpacing - span / 2,
            });
        });
    }

    return positions;
}

export function layoutSuperNodesByLevel(
    levels: number[],
    options: Pick<LevelLayoutOptions, 'levelSeparation' | 'originX'> = {},
): Map<string, { x: number; y: number }> {
    const { levelSeparation = 280, originX = 120 } = options;
    const positions = new Map<string, { x: number; y: number }>();

    for (const level of levels) {
        positions.set(`__super_${level}`, {
            x: originX + level * levelSeparation,
            y: 0,
        });
    }

    return positions;
}
