/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                display: ['Syne', 'system-ui', 'sans-serif'],
                sans: ['DM Sans', 'system-ui', 'sans-serif'],
            },
            colors: {
                graph: {
                    node: '#6366f1',
                    edge: '#818cf8',
                    glow: '#a5b4fc',
                },
            },
        },
    },
    plugins: [require('daisyui')],
    daisyui: {
        themes: [
            {
                light: {
                    primary: '#4f46e5',
                    'primary-content': '#ffffff',
                    secondary: '#0ea5e9',
                    accent: '#7c3aed',
                    neutral: '#1e293b',
                    'base-100': '#f8fafc',
                    'base-200': '#f1f5f9',
                    'base-300': '#e2e8f0',
                    info: '#0ea5e9',
                    success: '#10b981',
                    warning: '#f59e0b',
                    error: '#ef4444',
                },
                dark: {
                    primary: '#818cf8',
                    'primary-content': '#0f0f1a',
                    secondary: '#38bdf8',
                    accent: '#a78bfa',
                    neutral: '#cbd5e1',
                    'base-100': '#0c0e1a',
                    'base-200': '#12152a',
                    'base-300': '#1a1f3a',
                    info: '#38bdf8',
                    success: '#34d399',
                    warning: '#fbbf24',
                    error: '#f87171',
                },
            },
        ],
    },
};
