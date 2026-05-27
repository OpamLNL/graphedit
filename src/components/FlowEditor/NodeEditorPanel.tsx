import type { Topic } from '../../api/topics';
import type { KnowledgeNodeData } from './layoutUtils';
import NodeContentSection from '../NodeContentSection/NodeContentSection';

const PRESET_COLORS = [
    '#6366f1',
    '#10b981',
    '#0ea5e9',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#64748b',
];

interface NodeEditorPanelProps {
    node: KnowledgeNodeData | null;
    nodeKey: number | null;
    topics: Topic[];
    onChange: (patch: Partial<KnowledgeNodeData>) => void;
    onDelete: () => void;
}

export default function NodeEditorPanel({
    node,
    nodeKey,
    topics,
    onChange,
    onDelete,
}: NodeEditorPanelProps) {
    if (!node || nodeKey == null) {
        return (
            <div className="p-4 text-sm opacity-50 text-center">
                Обери вузол на полотні
            </div>
        );
    }

    const linkedTopic = node.topicId ? topics.find((t) => t.id === node.topicId) : null;

    return (
        <div className="p-4 space-y-4 overflow-y-auto">
            <div>
                <p className="text-[10px] uppercase tracking-widest opacity-40 mb-1">Вузол</p>
                <p className="text-xs opacity-60">
                    {node.dbId > 0 ? `id ${node.dbId}` : 'новий (не збережено)'}
                </p>
            </div>

            <label className="form-control w-full">
                <span className="label-text text-xs opacity-60">Назва</span>
                <input
                    className="input input-bordered input-sm"
                    value={node.label}
                    spellCheck={false}
                    onChange={(e) => onChange({ label: e.target.value })}
                />
            </label>

            <div>
                <span className="label-text text-xs opacity-60 block mb-2">Колір</span>
                <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map((c) => (
                        <button
                            key={c}
                            type="button"
                            className={`w-7 h-7 rounded-lg border-2 transition-transform ${
                                node.color === c ? 'border-white scale-110' : 'border-transparent'
                            }`}
                            style={{ background: c }}
                            onClick={() => onChange({ color: c })}
                            aria-label={c}
                        />
                    ))}
                </div>
            </div>

            <label className="form-control w-full">
                <span className="label-text text-xs opacity-60">Тема (topic)</span>
                <select
                    className="select select-bordered select-sm"
                    value={node.topicId ?? ''}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange({ topicId: val ? Number(val) : null });
                    }}
                >
                    <option value="">— без прив&apos;язки —</option>
                    {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.title}
                        </option>
                    ))}
                </select>
                {linkedTopic?.description && (
                    <p className="text-[10px] opacity-45 mt-1 line-clamp-2">{linkedTopic.description}</p>
                )}
            </label>

            <NodeContentSection nodeId={nodeKey} editable />

            <button type="button" className="btn btn-error btn-outline btn-sm w-full" onClick={onDelete}>
                Видалити вузол
            </button>
        </div>
    );
}
