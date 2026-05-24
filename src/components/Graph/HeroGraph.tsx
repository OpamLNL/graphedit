import { useEffect, useRef } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildHeroGraphOptions, HERO_DEMO_EDGES, HERO_DEMO_NODES } from './graphStyles';

export default function HeroGraph() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const networkRef = useRef<Network | null>(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!containerRef.current) return;

        const data = {
            nodes: new DataSet(HERO_DEMO_NODES),
            edges: new DataSet(HERO_DEMO_EDGES),
        };

        const options = buildHeroGraphOptions(theme);

        if (networkRef.current) {
            networkRef.current.destroy();
            networkRef.current = null;
        }

        const network = new Network(containerRef.current, data, options);
        networkRef.current = network;

        network.once('stabilizationIterationsDone', () => {
            network.setOptions({ physics: { enabled: false } });
            network.fit({
                animation: { duration: 800, easingFunction: 'easeInOutQuad' },
            });
        });

        return () => {
            network.destroy();
            networkRef.current = null;
        };
    }, [theme]);

    return (
        <div className="relative w-full h-full min-h-[300px] rounded-xl overflow-hidden">
            <div className="absolute inset-0 dot-grid opacity-25 pointer-events-none" />
            <div ref={containerRef} className="relative w-full h-full min-h-[300px]" />
        </div>
    );
}
