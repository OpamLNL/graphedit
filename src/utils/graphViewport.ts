export interface FocusMoveToOptions {
    position: { x: number; y: number };
    scale: number;
    offset: { x: number; y: number };
    animation: { duration: number; easingFunction: 'easeInOutQuad' } | false;
}

const DEFAULT_FOCUS_SCALE = 0.85;

/** Розміщує вузол по центру по X і на ~⅓ висоти viewport від верху */
export function buildFocusMoveTo(
    pos: { x: number; y: number },
    preserveScale?: number,
    canvasSize?: { width: number; height: number },
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