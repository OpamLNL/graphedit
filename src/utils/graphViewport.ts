export interface FocusMoveToOptions {
    position: { x: number; y: number };
    scale: number;
    offset: { x: number; y: number };
    animation: { duration: number; easingFunction: 'easeInOutQuad' };
}

const DEFAULT_FOCUS_SCALE = 0.7;
const FOCUS_TOP_OFFSET_Y = -170;

export function buildFocusMoveTo(
    pos: { x: number; y: number },
    preserveScale?: number,
): FocusMoveToOptions {
    return {
        position: { x: pos.x, y: pos.y },
        scale: preserveScale ?? DEFAULT_FOCUS_SCALE,
        offset: { x: 0, y: FOCUS_TOP_OFFSET_Y },
        animation: { duration: 400, easingFunction: 'easeInOutQuad' },
    };
}