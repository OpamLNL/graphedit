import type { MapJsonImportPayload } from '../api/graphEditMaps';
import { allocateGroupId } from '../components/FlowEditor/layoutUtils';

/**
 * Імпорт з JSON-файлу: id груп з експорту належать іншій карті.
 * Створюємо нові id і оновлюємо посилання (nodes, groupEdges, groupLayout, parentId).
 */
export function remapImportJsonGroupIds(
    payload: MapJsonImportPayload,
    allocateId: () => string = allocateGroupId,
): MapJsonImportPayload {
    const groups = payload.groups ?? [];
    const idMap = new Map<string, string>();

    for (const g of groups) {
        idMap.set(g.id, allocateId());
    }

    for (const n of payload.nodes) {
        if (n.groupId && !idMap.has(n.groupId)) {
            idMap.set(n.groupId, allocateId());
        }
    }

    if (idMap.size === 0) {
        return payload;
    }

    const remap = (id: string | null | undefined): string | null => {
        if (id == null) return null;
        return idMap.get(id) ?? id;
    };

    const groupLayout: Record<string, { x: number; y: number }> = {};
    for (const [oldId, pos] of Object.entries(payload.groupLayout ?? {})) {
        groupLayout[remap(oldId) ?? oldId] = pos;
    }

    return {
        ...payload,
        groups: groups.map((g) => ({
            ...g,
            id: idMap.get(g.id)!,
            parentId: remap(g.parentId),
        })),
        nodes: payload.nodes.map((n) => ({
            ...n,
            groupId: remap(n.groupId),
        })),
        groupEdges: (payload.groupEdges ?? []).map((e) => ({
            ...e,
            from: idMap.get(e.from) ?? e.from,
            to: idMap.get(e.to) ?? e.to,
        })),
        groupLayout,
    };
}
