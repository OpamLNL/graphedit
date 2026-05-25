export interface FocusMoveToOptions {
    position: { x: number; y: number };
    scale: number;
    offset: { x: number; y: number };
    animation: { duration: number; easingFunction: 'easeInOutQuad' } | false;
}

export interface CanvasSize {
    width: number;
    height: number;
}

export interface ZoomLimits {
    min: number;
    max: number;
}

export interface ContentBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cx: number;
    cy: number;
}

export interface ViewportNetwork {
    getScale(): number;
    getViewPosition(): { x: number; y: number };
    DOMtoCanvas(point: { x: number; y: number }): { x: number; y: number };
    moveTo(options: {
        position?: { x: number; y: number };
        scale?: number;
        offset?: { x: number; y: number };
        animation?: { duration: number; easingFunction: string } | false;
    }): void;
}

const DEFAULT_FOCUS_SCALE = 0.85;
const FIT_MIN_RATIO = 0.55;
const FIT_MAX_RATIO = 2.8;
const GROUPS_FIT_MIN_RATIO = 0.4;
const GROUPS_MAX_SCALE = 4;
const ABSOLUTE_MIN_SCALE = 0.2;
const ABSOLUTE_MAX_SCALE = 2.5;

/** Розміщує вузол по центру по X і на ~⅓ висоти viewport від верху */
export function buildFocusMoveTo(
    pos: { x: number; y: number },
    preserveScale?: number,
    canvasSize?: CanvasSize,
): FocusMoveToOptions {
    const h = canvasSize?.height ?? 600;

    return {
        position: { x: pos.x, y: pos.y },
        scale: preserveScale ?? DEFAULT_FOCUS_SCALE,
        offset: {
            x: 0,
            y: -h / 6,
        },
        animation: { duration: 350, easingFunction: 'easeInOutQuad' },
    };
}

export function limitsFromFitScale(
    fitScale: number,
    view: 'groups' | 'topics' = 'topics',
): ZoomLimits {
    const base = fitScale > 0 ? fitScale : DEFAULT_FOCUS_SCALE;

    if (view === 'groups') {
        return {
            min: Math.max(0.06, base * GROUPS_FIT_MIN_RATIO),
            max: Math.max(GROUPS_MAX_SCALE, base * 12),
        };
    }

    return {
        min: Math.max(ABSOLUTE_MIN_SCALE, base * FIT_MIN_RATIO),
        max: Math.min(ABSOLUTE_MAX_SCALE, base * FIT_MAX_RATIO),
    };
}

export function clampScale(scale: number, limits: ZoomLimits): number {
    return Math.min(limits.max, Math.max(limits.min, scale));
}

export function layoutEntriesExcluding(
    layout: Map<number | string, { x: number; y: number }>,
    excludeIds?: Set<string>,
): Map<number | string, { x: number; y: number }> {
    if (!excludeIds || excludeIds.size === 0) return layout;
    const filtered = new Map<number | string, { x: number; y: number }>();
    for (const [id, pos] of layout) {
        if (!excludeIds.has(String(id))) filtered.set(id, pos);
    }
    return filtered.size > 0 ? filtered : layout;
}

/** Масштаб від основного графа, якір — зверху (без орієнтації на хвостові вузли) */
export function fitViewTopAnchored(
    network: ViewportNetwork,
    layout: Map<number | string, { x: number; y: number }>,
    canvasSize: CanvasSize,
    options: {
        excludeIds?: Set<string>;
        padding?: number;
        topPadding?: number;
        viewScope?: 'groups' | 'topics';
        fitScaleRef?: { current: number };
    } = {},
): number {
    const {
        excludeIds,
        padding = 56,
        topPadding = 44,
        viewScope = 'topics',
        fitScaleRef,
    } = options;

    const filtered = layoutEntriesExcluding(layout, excludeIds);
    const bounds = contentBoundsFromLayout(filtered, padding);
    if (!bounds) return network.getScale();

    const contentW = Math.max(bounds.maxX - bounds.minX, 80);
    const contentH = Math.max(bounds.maxY - bounds.minY, 80);

    const fitScale = fitScaleRef?.current ?? DEFAULT_FOCUS_SCALE;
    const limits = limitsFromFitScale(fitScale, viewScope);

    const scaleX = (canvasSize.width - padding * 2) / contentW;
    const scaleY = (canvasSize.height - topPadding - padding) / contentH;
    let scale = Math.min(scaleX, scaleY, viewScope === 'groups' ? 1.05 : 1.15);
    scale = clampScale(scale, limits);

    network.moveTo({
        position: { x: bounds.cx, y: bounds.minY },
        scale,
        offset: {
            x: 0,
            y: topPadding - canvasSize.height / 2,
        },
        animation: false,
    });

    if (fitScaleRef) fitScaleRef.current = scale;
    return scale;
}

export function applyStoredViewport(
    network: ViewportNetwork,
    stored: { scale: number; position: { x: number; y: number } },
    animate = false,
): void {
    network.moveTo({
        position: stored.position,
        scale: stored.scale,
        animation: animate
            ? { duration: 280, easingFunction: 'easeInOutQuad' }
            : false,
    });
}

export function contentBoundsFromLayout(
    layout: Map<number | string, { x: number; y: number }>,
    padding = 100,
): ContentBounds | null {
    const points = [...layout.values()];
    if (points.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }

    return {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
    };
}

function viewIntersectsContent(
    viewPos: { x: number; y: number },
    scale: number,
    canvasSize: CanvasSize,
    bounds: ContentBounds,
): boolean {
    const halfW = canvasSize.width / (2 * scale);
    const halfH = canvasSize.height / (2 * scale);
    const vx0 = viewPos.x - halfW;
    const vx1 = viewPos.x + halfW;
    const vy0 = viewPos.y - halfH;
    const vy1 = viewPos.y + halfH;

    return vx0 < bounds.maxX && vx1 > bounds.minX && vy0 < bounds.maxY && vy1 > bounds.minY;
}

/** Якщо після zoom/pan граф повністю поза екраном — м’яко повертає до контенту або активного вузла */
export function ensureGraphVisible(
    network: ViewportNetwork,
    layout: Map<number | string, { x: number; y: number }>,
    canvasSize: CanvasSize,
    preferCanvasPoint?: { x: number; y: number } | null,
): void {
    const bounds = contentBoundsFromLayout(layout);
    if (!bounds) return;

    const scale = network.getScale();
    const viewPos = network.getViewPosition();
    if (viewIntersectsContent(viewPos, scale, canvasSize, bounds)) return;

    const target = preferCanvasPoint ?? { x: bounds.cx, y: bounds.cy };
    network.moveTo({
        position: target,
        scale,
        offset: { x: 0, y: 0 },
        animation: { duration: 220, easingFunction: 'easeInOutQuad' },
    });
}

/** Zoom до DOM-точки (курсор / центр / активний вузол) без стрибка камери */
export function zoomAtDomPoint(
    network: ViewportNetwork,
    pointerDom: { x: number; y: number },
    factor: number,
    canvasSize: CanvasSize,
    limits: ZoomLimits,
): number {
    const scaleOld = network.getScale();
    const scaleNew = clampScale(scaleOld * factor, limits);
    if (Math.abs(scaleNew - scaleOld) < 1e-6) return scaleOld;

    const anchorCanvas = network.DOMtoCanvas(pointerDom);
    network.moveTo({
        position: anchorCanvas,
        scale: scaleNew,
        offset: {
            x: pointerDom.x - canvasSize.width / 2,
            y: pointerDom.y - canvasSize.height / 2,
        },
        animation: false,
    });

    return scaleNew;
}
