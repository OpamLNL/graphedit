import type { Options } from 'vis-network/standalone';

export type GraphTheme = 'light' | 'dark';

const STATUS_COLORS = {
    completed: { bg: '#6366f1', border: '#818cf8', highlight: '#a5b4fc' },
    available: { bg: '#10b981', border: '#34d399', highlight: '#6ee7b7' },
    locked: { bg: '#64748b', border: '#94a3b8', highlight: '#cbd5e1' },
} as const;

export function nodeColorByStatus(status: 'completed' | 'available' | 'locked') {
    const c = STATUS_COLORS[status] ?? STATUS_COLORS.locked;
    return {
        background: c.bg,
        border: c.border,
        highlight: { background: c.highlight, border: '#ffffff' },
        hover: { background: c.highlight, border: '#ffffff' },
    };
}

export function buildViewGraphOptions(
    theme: GraphTheme,
    mode: 'view' | 'edit' = 'view',
    nodeCount = 0,
    superMode = false,
): Options {
    const isDark = theme === 'dark';
    const fontColor = isDark ? '#e2e8f0' : '#1e293b';
    const edgeColor = isDark ? 'rgba(129, 140, 248, 0.55)' : 'rgba(79, 70, 229, 0.4)';
    const isDenseTopics = !superMode && nodeCount > 80;

    const topicScaling = {
        min: isDenseTopics ? 10 : 14,
        max: isDenseTopics ? 22 : 28,
    };

    const groupEdgeColor = isDark ? 'rgba(165, 180, 252, 0.7)' : 'rgba(79, 70, 229, 0.55)';

    return {
        layout: superMode
            ? { hierarchical: { enabled: false } }
            : { hierarchical: { enabled: false } },
        nodes: {
            shape: superMode ? 'box' : 'dot',
            size: superMode ? 36 : isDenseTopics ? 10 : 14,
            borderWidth: superMode ? 2 : isDenseTopics ? 1.5 : 2,
            shadow: superMode
                ? {
                      enabled: true,
                      color: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(79, 70, 229, 0.16)',
                      size: 12,
                      x: 0,
                      y: 3,
                  }
                : isDenseTopics
                  ? false
                  : {
                        enabled: true,
                        color: isDark ? 'rgba(99, 102, 241, 0.4)' : 'rgba(79, 70, 229, 0.2)',
                        size: 14,
                        x: 0,
                        y: 3,
                    },
            font: {
                size: superMode ? 14 : 12,
                color: superMode ? '#f8fafc' : fontColor,
                face: 'DM Sans, system-ui, sans-serif',
                strokeWidth: superMode ? 0 : 2,
                strokeColor: isDark ? '#0f172a' : '#f8fafc',
                multi: superMode ? true : undefined,
            },
            ...(superMode ? {} : { scaling: topicScaling }),
            margin: (superMode ? 12 : 10) as never,
        },
        edges: {
            width: superMode ? 2.2 : isDenseTopics ? 1 : 2,
            smooth: {
                enabled: true,
                type: 'cubicBezier',
                roundness: superMode ? 0.42 : isDenseTopics ? 0.2 : 0.35,
            },
            color: {
                color: superMode ? groupEdgeColor : edgeColor,
                highlight: isDark ? '#c7d2fe' : '#6366f1',
                hover: isDark ? '#e0e7ff' : '#818cf8',
                opacity: superMode ? 0.88 : isDenseTopics ? 0.45 : 0.85,
            },
            arrows: {
                to: {
                    enabled: true,
                    scaleFactor: superMode ? 0.72 : isDenseTopics ? 0.45 : 0.7,
                    type: 'arrow',
                },
            },
            shadow: false,
        },
        physics: { enabled: false },
        interaction: {
            hover: true,
            dragNodes: mode === 'edit',
            dragView: true,
            zoomView: true,
            selectable: superMode,
            selectConnectedEdges: false,
            multiselect: false,
            navigationButtons: false,
            keyboard: { enabled: false },
            tooltipDelay: 120,
            hideEdgesOnDrag: false,
            hideNodesOnDrag: false,
        },
    };
}

export function buildHeroGraphOptions(theme: GraphTheme): Options {
    const isDark = theme === 'dark';

    return {
        nodes: {
            shape: 'dot',
            size: 28,
            borderWidth: 3,
            shadow: {
                enabled: true,
                color: 'rgba(99, 102, 241, 0.55)',
                size: 20,
                x: 0,
                y: 4,
            },
            font: {
                size: 12,
                color: '#ffffff',
                face: 'DM Sans, system-ui, sans-serif',
                strokeWidth: 0,
            },
            scaling: { min: 22, max: 34 },
        },
        edges: {
            width: 2.5,
            smooth: { enabled: true, type: 'dynamic', roundness: 0.45 },
            color: {
                color: isDark ? 'rgba(129, 140, 248, 0.75)' : 'rgba(99, 102, 241, 0.6)',
                highlight: '#c7d2fe',
            },
            arrows: { to: { enabled: true, scaleFactor: 0.65 } },
        },
        physics: {
            enabled: true,
            stabilization: { iterations: 150, fit: true },
            barnesHut: {
                gravitationalConstant: -9000,
                springLength: 130,
                springConstant: 0.045,
                avoidOverlap: 0.2,
            },
        },
        interaction: {
            hover: false,
            dragNodes: false,
            dragView: false,
            zoomView: false,
            selectable: false,
        },
    };
}

export const HERO_DEMO_NODES = [
    {
        id: 1,
        label: 'Основи',
        color: {
            background: '#6366f1',
            border: '#a5b4fc',
            highlight: { background: '#818cf8', border: '#e0e7ff' },
        },
    },
    {
        id: 2,
        label: 'Масиви',
        color: {
            background: '#7c3aed',
            border: '#a78bfa',
            highlight: { background: '#8b5cf6', border: '#ede9fe' },
        },
    },
    {
        id: 3,
        label: 'Функції',
        color: {
            background: '#6366f1',
            border: '#a5b4fc',
            highlight: { background: '#818cf8', border: '#e0e7ff' },
        },
    },
    {
        id: 4,
        label: 'ООП',
        color: {
            background: '#0ea5e9',
            border: '#38bdf8',
            highlight: { background: '#0284c7', border: '#e0f2fe' },
        },
    },
    {
        id: 5,
        label: 'Класи',
        color: {
            background: '#10b981',
            border: '#34d399',
            highlight: { background: '#059669', border: '#d1fae5' },
        },
    },
    {
        id: 6,
        label: 'API',
        color: {
            background: '#7c3aed',
            border: '#a78bfa',
            highlight: { background: '#8b5cf6', border: '#ede9fe' },
        },
    },
    {
        id: 7,
        label: 'Graph',
        color: {
            background: '#6366f1',
            border: '#c7d2fe',
            highlight: { background: '#818cf8', border: '#ffffff' },
        },
    },
];

export const HERO_DEMO_EDGES = [
    { from: 1, to: 2 },
    { from: 1, to: 3 },
    { from: 2, to: 4 },
    { from: 3, to: 5 },
    { from: 4, to: 6 },
    { from: 5, to: 6 },
    { from: 6, to: 7 },
];
