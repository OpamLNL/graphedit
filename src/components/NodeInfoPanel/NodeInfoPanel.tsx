import { useState } from 'react';
import type { NodeData } from '../Graph/Graph';
import type { Topic } from '../../api/topics';
import { progressApi } from '../../api/progress';
import NodeContentSection from '../NodeContentSection/NodeContentSection';

interface NodeInfoPanelProps {
    node: NodeData | null;
    topic?: Topic | null;
    onProgressUpdate?: () => void;
}

export default function NodeInfoPanel({ node, topic: topicProp, onProgressUpdate }: NodeInfoPanelProps) {
    const [marking, setMarking] = useState(false);

    const handleMarkAsLearned = async () => {
        if (!node?.topicId) return;
        setMarking(true);
        try {
            await progressApi.markTopicComplete(node.topicId);
            await onProgressUpdate?.();
        } catch (err) {
            console.error('Помилка збереження прогресу:', err);
        } finally {
            setMarking(false);
        }
    };

    return (
        <div className="card w-80 max-h-[min(560px,calc(100vh-120px))] overflow-y-auto bg-base-100 shadow-md m-4 border border-base-content/10">
            <div className="card-body min-h-48 p-4">
                {!node ? (
                    <p className="italic text-sm opacity-60">Оберіть вузол, щоб побачити інформацію</p>
                ) : (
                    <>
                        {node.status === 'available' && (
                            <button
                                onClick={handleMarkAsLearned}
                                disabled={marking}
                                className="btn btn-success mb-4 w-full"
                            >
                                {marking ? 'Збереження...' : '✅ Вивчити'}
                            </button>
                        )}

                        {node.status === 'completed' && (
                            <button disabled className="btn btn-primary mb-4 w-full">
                                ✔ Вивчено
                            </button>
                        )}

                        {node.status === 'locked' && (
                            <button disabled className="btn btn-outline mb-4 w-full">
                                🔒 Недоступно
                            </button>
                        )}

                        <h2 className="text-xl font-bold">{topicProp?.title ?? node.title ?? node.label}</h2>

                        <NodeContentSection
                            nodeId={node.id}
                            fallbackDescription={topicProp?.description ?? null}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
