import { useCallback, useEffect, useState } from 'react';
import {
    graphEditMapsApi,
    type EditorGraphResponse,
    type MapRevision,
} from '../../api/graphEditMaps';

interface EditorRevisionsPanelProps {
    mapId: number;
    open: boolean;
    dirty: boolean;
    onClose: () => void;
    onRestored: (graph: EditorGraphResponse) => Promise<void>;
}

function formatRevisionDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('uk-UA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function EditorRevisionsPanel({
    mapId,
    open,
    dirty,
    onClose,
    onRestored,
}: EditorRevisionsPanelProps) {
    const [revisions, setRevisions] = useState<MapRevision[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [creating, setCreating] = useState(false);
    const [restoringId, setRestoringId] = useState<number | null>(null);

    const loadRevisions = useCallback(async () => {
        if (!open || !mapId) return;
        setLoading(true);
        setError(null);
        try {
            const list = await graphEditMapsApi.listRevisions(mapId);
            setRevisions(list);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не вдалося завантажити історію');
            setRevisions([]);
        } finally {
            setLoading(false);
        }
    }, [mapId, open]);

    useEffect(() => {
        if (open) {
            void loadRevisions();
        } else {
            setComment('');
            setError(null);
            setRestoringId(null);
        }
    }, [open, loadRevisions]);

    const handleCreateSnapshot = async () => {
        setCreating(true);
        setError(null);
        try {
            await graphEditMapsApi.createRevision(
                mapId,
                comment.trim() || 'Ручний знімок',
            );
            setComment('');
            await loadRevisions();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не вдалося створити знімок');
        } finally {
            setCreating(false);
        }
    };

    const handleRestore = async (revision: MapRevision) => {
        const nodeCount = revision.snapshotJson.nodes.length;
        const edgeCount = revision.snapshotJson.edges.length;
        const msg = dirty
            ? `Відновити версію #${revision.id} (${nodeCount} вузлів, ${edgeCount} ребер)?\n\nНезбережені зміни будуть втрачені.`
            : `Відновити версію #${revision.id} (${nodeCount} вузлів, ${edgeCount} ребер)?`;

        if (!window.confirm(msg)) return;

        setRestoringId(revision.id);
        setError(null);
        try {
            const graph = await graphEditMapsApi.restoreRevision(mapId, revision.id);
            await onRestored(graph);
            await loadRevisions();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не вдалося відновити версію');
        } finally {
            setRestoringId(null);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-300/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
                <div className="p-4 border-b border-base-content/10 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="font-display font-bold text-lg">Історія версій</h2>
                        <p className="text-xs opacity-60">
                            Знімки графа · відкат до попереднього стану
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-circle"
                        onClick={onClose}
                        aria-label="Закрити"
                    >
                        ×
                    </button>
                </div>

                <div className="p-4 border-b border-base-content/5 space-y-2">
                    <label className="form-control w-full">
                        <span className="label-text text-xs opacity-60">
                            Коментар до нового знімка
                        </span>
                        <input
                            type="text"
                            className="input input-sm input-bordered w-full"
                            placeholder="Напр. Перед зміною структури модулів"
                            value={comment}
                            maxLength={500}
                            onChange={(e) => setComment(e.target.value)}
                        />
                    </label>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm w-full"
                        disabled={creating || restoringId != null}
                        onClick={() => void handleCreateSnapshot()}
                    >
                        {creating ? 'Створення...' : '+ Створити знімок поточного стану'}
                    </button>
                    <p className="text-[10px] opacity-45 leading-snug">
                        Автознімки також створюються перед публікацією та при редагуванні
                        опублікованої карти.
                    </p>
                </div>

                {error && (
                    <div className="px-4 pt-3">
                        <p className="text-xs text-error">{error}</p>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto min-h-0 p-4">
                    {loading ? (
                        <p className="text-sm opacity-50 text-center py-8">Завантаження...</p>
                    ) : revisions.length === 0 ? (
                        <p className="text-sm opacity-50 text-center py-8">
                            Ще немає збережених версій. Створіть перший знімок або опублікуйте
                            карту.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {revisions.map((rev) => {
                                const nodes = rev.snapshotJson?.nodes?.length ?? 0;
                                const edges = rev.snapshotJson?.edges?.length ?? 0;
                                const isRestoring = restoringId === rev.id;

                                return (
                                    <li
                                        key={rev.id}
                                        className="rounded-lg border border-base-content/10 bg-base-200/30 p-3 flex flex-col gap-2"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold">
                                                    #{rev.id}
                                                    <span className="font-normal opacity-50 ml-2">
                                                        {formatRevisionDate(rev.createdAt)}
                                                    </span>
                                                </p>
                                                <p
                                                    className="text-sm mt-0.5 truncate"
                                                    title={rev.comment ?? undefined}
                                                >
                                                    {rev.comment?.trim() || 'Без коментаря'}
                                                </p>
                                                <p className="text-[10px] opacity-45 mt-1">
                                                    {nodes} вузлів · {edges} ребер
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-outline btn-xs shrink-0"
                                                disabled={
                                                    restoringId != null ||
                                                    creating ||
                                                    isRestoring
                                                }
                                                onClick={() => void handleRestore(rev)}
                                            >
                                                {isRestoring ? '...' : 'Відновити'}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
