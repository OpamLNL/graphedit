import type { CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { KnowledgeNodeData } from './layoutUtils';

export default function KnowledgeNode({ data, selected }: NodeProps) {
    const d = data as KnowledgeNodeData;
    const accent = d.color || '#6366f1';

    return (
        <div
            className={`knowledge-node ${selected ? 'knowledge-node--selected' : ''} ${
                d.isConnectSource ? 'knowledge-node--connect-source' : ''
            }`}
            style={{ '--node-accent': accent } as CSSProperties}
        >
            <Handle type="target" position={Position.Left} className="knowledge-handle" />
            <div className="knowledge-node-inner">
                <span className="knowledge-node-dot" />
                <span className="knowledge-node-label">{d.label}</span>
            </div>
            <Handle type="source" position={Position.Right} className="knowledge-handle" />
        </div>
    );
}
