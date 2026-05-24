import { useEffect, useRef } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import { useTheme } from '../../context/ThemeContext';
import { buildViewGraphOptions, nodeColorByStatus } from './graphStyles';

export interface NodeData {
    id: number;
    label: string;
    title: string;
    topicId: number;
    x: number | null;
    y: number | null;
    level: number;
    progress: number;
    status: 'completed' | 'available' | 'locked';
}

export interface EdgeData {
    from: number;
    to: number;
}

interface GraphProps {
    nodes: NodeData[];
    edges: EdgeData[];
    onNodeClick?: (nodeId: number) => void;
    activeNodeId?: number | null;
    mode?: 'view' | 'edit';
}

export default function Graph({ nodes, edges, onNodeClick, activeNodeId, mode = 'view' }: GraphProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const networkRef = useRef<Network | null>(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!containerRef.current) return;

        const styledNodes = nodes.map((node) => ({
            id: node.id,
            label: node.label,
            title: node.title,
            color: nodeColorByStatus(node.status),
            ...(node.x != null && node.y != null ? { x: node.x, y: node.y } : {}),
        }));

        const data = {
            nodes: new DataSet(styledNodes),
            edges: new DataSet(edges),
        };

        const options = buildViewGraphOptions(theme, mode);

        if (networkRef.current) {
            networkRef.current.destroy();
            networkRef.current = null;
        }

        const network = new Network(containerRef.current, data, options);
        networkRef.current = network;

        if (onNodeClick) {
            network.on('click', (params) => {
                if (params.nodes.length > 0) {
                    const clickedId = params.nodes[0] as number;
                    onNodeClick(clickedId);
                    localStorage.setItem('lastFocusedNodeId', clickedId.toString());
                }
            });
        }

        window.__focusGraphNode = (id: number) => {
            if (!networkRef.current) return;
            networkRef.current.selectNodes([id]);
            networkRef.current.focus(id, {
                scale: 1.1,
                animation: { duration: 500, easingFunction: 'easeInOutQuad' },
            });
        };

        return () => {
            network.destroy();
            networkRef.current = null;
        };
    }, [nodes, edges, theme, mode, onNodeClick]);

    useEffect(() => {
        if (!networkRef.current || activeNodeId == null) return;
        networkRef.current.selectNodes([activeNodeId]);
    }, [activeNodeId]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full min-h-[500px] bg-base-200/20 rounded-lg"
        />
    );
}

declare global {
    interface Window {
        __focusGraphNode?: (id: number) => void;
    }
}
