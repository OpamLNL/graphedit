import type { GraphViewScope } from '../components/Graph/Graph';
import type { ViewportNetwork } from './graphViewport';

export interface StoredViewport {
    scale: number;
    position: { x: number; y: number };
}

export function viewportStorageKey(
    storageId: string | number,
    scope: GraphViewScope,
    groupId: string | null,
): string {
    return `km-viewport:v1:${storageId}:${scope}:${groupId ?? ''}`;
}

export function loadStoredViewport(key: string): StoredViewport | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredViewport;
        if (
            typeof parsed.scale !== 'number' ||
            !parsed.position ||
            typeof parsed.position.x !== 'number' ||
            typeof parsed.position.y !== 'number'
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function saveStoredViewport(key: string, network: ViewportNetwork): void {
    try {
        const scale = network.getScale();
        const position = network.getViewPosition();
        if (scale <= 0) return;
        const payload: StoredViewport = { scale, position };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch {
        /* quota / private mode */
    }
}
