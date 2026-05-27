import { useState } from 'react';
import type { NodeData } from '../Graph/Graph';
import type { Topic } from '../../api/topics';
import { progressApi } from '../../api/progress';
import { ApiError } from '../../api/client';
import NodeContentSection from '../NodeContentSection/NodeContentSection';

function parseApiError(e: unknown): string {
    if (e instanceof ApiError) {
        try {
            const body = JSON.parse(e.message) as { message?: string | string[] };
            if (Array.isArray(body.message)) return body.message.join(', ');
            if (body.message) return body.message;
        } catch {
            /* plain text */
        }
        return e.message;
    }
    if (e instanceof Error) return e.message;
    return 'Не вдалося зберегти прогрес';
}

interface NodeInfoPanelProps {
    node: NodeData | null;
    topic?: Topic | null;
    mapId?: number;
    onProgressUpdate?: () => void;
    embedded?: boolean;
}

export default function NodeInfoPanel({
    node,
    topic: topicProp,
    mapId,
    onProgressUpdate,
    embedded = false,
}: NodeInfoPanelProps) {
    const [marking, setMarking] = useState(false);
    const [markError, setMarkError] = useState<string | null>(null);

    const handleMarkAsLearned = async () => {
        if (!node || mapId == null || Number.isNaN(mapId)) return;
        setMarking(true);
        setMarkError(null);
        try {
            await progressApi.markTopicComplete({
                mapId,
                topicId: node.topicId,
                nodeId: node.id,
            });
            await onProgressUpdate?.();
        } catch (err) {
            console.error('Помилка збереження прогресу:', err);
            setMarkError(parseApiError(err));
        } finally {
            setMarking(false);
        }
    };

    const canMarkProgress =
        node?.status === 'available' &&
        mapId != null &&
        !Number.isNaN(mapId) &&
        (node.topicId != null || node.groupId != null);

    return (
        <div
            className={
                embedded
                    ? 'p-4'
                    : 'card w-80 max-h-[min(560px,calc(100vh-120px))] overflow-y-auto bg-base-100 shadow-md m-4 border border-base-content/10'
            }
        >
            <div className={embedded ? 'space-y-3' : 'card-body min-h-48 p-4'}>
                {!node ? (
                    <p className="italic text-sm opacity-60">Оберіть вузол, щоб побачити інформацію</p>
                ) : (
                    <>
                        {node.status === 'available' && canMarkProgress && (
                            <button
                                onClick={handleMarkAsLearned}
                                disabled={marking}
                                className="btn btn-success mb-4 w-full"
                            >
                                {marking ? 'Збереження...' : '✅ Вивчити'}
                            </button>
                        )}

                        {node.status === 'available' && !canMarkProgress && (
                            <p className="text-sm text-warning mb-4">
                                Прогрес для цього вузла недоступний (немає групи або карти).
                            </p>
                        )}

                        {node.status === 'completed' && (
                            <button disabled className="btn btn-primary mb-4 w-full">
                                ✔ Вивчено
                            </button>
                        )}

                        {markError && (
                            <p className="text-sm text-error mb-3">{markError}</p>
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
