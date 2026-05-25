import type { GraphViewScope } from '../components/Graph/Graph';

export type GraphNavigationMode = 'view' | 'editor';

export interface StoredGraphNavigation {
    viewScope: GraphViewScope;
    selectedGroupId: string | null;
    activeNodeId: number | null;
    activeGroupId?: string | null;
}

export function navigationStorageKey(mapId: number, mode: GraphNavigationMode): string {
    return `km-nav:v1:${mapId}:${mode}`;
}

export function loadStoredNavigation(key: string): StoredGraphNavigation | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredGraphNavigation;
        if (parsed.viewScope !== 'groups' && parsed.viewScope !== 'topics') return null;
        return {
            viewScope: parsed.viewScope,
            selectedGroupId:
                typeof parsed.selectedGroupId === 'string' ? parsed.selectedGroupId : null,
            activeNodeId: typeof parsed.activeNodeId === 'number' ? parsed.activeNodeId : null,
            activeGroupId:
                typeof parsed.activeGroupId === 'string' ? parsed.activeGroupId : null,
        };
    } catch {
        return null;
    }
}

export function saveStoredNavigation(key: string, nav: StoredGraphNavigation): void {
    try {
        localStorage.setItem(key, JSON.stringify(nav));
    } catch {
        /* quota / private mode */
    }
}

export function resolveStoredNavigation(
    stored: StoredGraphNavigation | null,
    groupIds: Set<string>,
    nodeIds: Set<number>,
): StoredGraphNavigation {
    const fallback: StoredGraphNavigation = {
        viewScope: 'groups',
        selectedGroupId: null,
        activeNodeId: null,
        activeGroupId: null,
    };
    if (!stored) return fallback;

    const activeGroupId =
        stored.activeGroupId && groupIds.has(stored.activeGroupId)
            ? stored.activeGroupId
            : null;

    if (
        stored.viewScope === 'topics' &&
        stored.selectedGroupId &&
        groupIds.has(stored.selectedGroupId)
    ) {
        const activeNodeId =
            stored.activeNodeId != null && nodeIds.has(stored.activeNodeId)
                ? stored.activeNodeId
                : null;
        return {
            viewScope: 'topics',
            selectedGroupId: stored.selectedGroupId,
            activeNodeId,
            activeGroupId: stored.selectedGroupId,
        };
    }

    return {
        viewScope: 'groups',
        selectedGroupId: null,
        activeNodeId: null,
        activeGroupId,
    };
}

export function applyStoredNavigation(
    mapId: number,
    mode: GraphNavigationMode,
    groupIds: Iterable<string>,
    nodeIds: Iterable<number>,
): StoredGraphNavigation {
    const key = navigationStorageKey(mapId, mode);
    return resolveStoredNavigation(
        loadStoredNavigation(key),
        new Set(groupIds),
        new Set(nodeIds),
    );
}
