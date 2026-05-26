import { useCallback, useEffect, useState } from 'react';
import {
    knowledgeMapsApi,
    type ImportLibraryGroup,
    type ImportLibraryNode,
    type ImportLibraryResponse,
} from '../../api/knowledgeMaps';

type LibraryTab = 'groups' | 'nodes';

interface EditorLibraryPanelProps {
    mapId: number;
    open: boolean;
    onClose: () => void;
    onImportGroup: (item: ImportLibraryGroup) => Promise<void>;
    onImportNode: (item: ImportLibraryNode, targetGroupId: string | null) => Promise<void>;
    defaultTargetGroupId?: string | null;
    currentGroups: { id: string; title: string }[];
}

export default function EditorLibraryPanel({
    mapId,
    open,
    onClose,
    onImportGroup,
    onImportNode,
    defaultTargetGroupId = null,
    currentGroups,
}: EditorLibraryPanelProps) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sourceMapId, setSourceMapId] = useState<number | ''>('');
    const [tab, setTab] = useState<LibraryTab>('groups');
    const [data, setData] = useState<ImportLibraryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [importingKey, setImportingKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [nodeTargetGroupId, setNodeTargetGroupId] = useState<string>('');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        if (!open) return;
        setNodeTargetGroupId(defaultTargetGroupId ?? '');
    }, [open, defaultTargetGroupId]);

    const loadLibrary = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        setError(null);
        try {
            const result = await knowledgeMapsApi.getImportLibrary(mapId, {
                search: debouncedSearch || undefined,
                sourceMapId: sourceMapId === '' ? undefined : sourceMapId,
            });
            setData(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Помилка завантаження бібліотеки');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [mapId, open, debouncedSearch, sourceMapId]);

    useEffect(() => {
        loadLibrary();
    }, [loadLibrary]);

    const handleImportGroup = async (item: ImportLibraryGroup) => {
        const key = `g:${item.mapId}:${item.id}`;
        setImportingKey(key);
        try {
            await onImportGroup(item);
        } finally {
            setImportingKey(null);
        }
    };

    const handleImportNode = async (item: ImportLibraryNode) => {
        const targetId = nodeTargetGroupId || defaultTargetGroupId;
        if (!targetId) {
            setError('Оберіть цільову групу для вузла');
            return;
        }
        const key = `n:${item.mapId}:${item.id}`;
        setImportingKey(key);
        try {
            await onImportNode(item, targetId);
        } finally {
            setImportingKey(null);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base-300/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">
                <div className="p-4 border-b border-base-content/10 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="font-display font-bold text-lg">Бібліотека</h2>
                        <p className="text-xs opacity-60">
                            Групи та вузли з ваших інших карт
                        </p>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
                        ×
                    </button>
                </div>

                <div className="p-4 space-y-3 border-b border-base-content/5">
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="search"
                            className="input input-sm input-bordered flex-1 min-w-[180px]"
                            placeholder="Пошук за назвою..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select
                            className="select select-sm select-bordered min-w-[160px]"
                            value={sourceMapId}
                            onChange={(e) =>
                                setSourceMapId(
                                    e.target.value === '' ? '' : Number(e.target.value),
                                )
                            }
                        >
                            <option value="">Усі мої карти</option>
                            {(data?.maps ?? []).map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-1">
                        <button
                            type="button"
                            className={`btn btn-xs ${tab === 'groups' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setTab('groups')}
                        >
                            Групи ({data?.groups.length ?? 0})
                        </button>
                        <button
                            type="button"
                            className={`btn btn-xs ${tab === 'nodes' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setTab('nodes')}
                        >
                            Вузли ({data?.nodes.length ?? 0})
                        </button>
                    </div>

                    {tab === 'nodes' && (
                        <select
                            className="select select-sm select-bordered w-full"
                            value={nodeTargetGroupId}
                            onChange={(e) => setNodeTargetGroupId(e.target.value)}
                        >
                            <option value="">— Цільова група на поточній карті —</option>
                            {currentGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.title}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
                    {loading && (
                        <p className="text-sm opacity-60 text-center py-8">Завантаження...</p>
                    )}
                    {!loading && error && (
                        <p className="text-sm text-error text-center py-4">{error}</p>
                    )}
                    {!loading && !error && tab === 'groups' && (data?.groups.length ?? 0) === 0 && (
                        <p className="text-sm opacity-60 text-center py-8">
                            Немає груп у ваших інших картах
                        </p>
                    )}
                    {!loading && !error && tab === 'nodes' && (data?.nodes.length ?? 0) === 0 && (
                        <p className="text-sm opacity-60 text-center py-8">
                            Немає вузлів у ваших інших картах
                        </p>
                    )}

                    {tab === 'groups' &&
                        (data?.groups ?? []).map((item) => {
                            const key = `g:${item.mapId}:${item.id}`;
                            return (
                                <div
                                    key={key}
                                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-base-200/50 border border-base-content/5"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{item.title}</p>
                                        <p className="text-xs opacity-50 truncate">
                                            {item.mapTitle} · {item.nodeCount} вузлів
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-xs shrink-0"
                                        disabled={importingKey === key}
                                        onClick={() => handleImportGroup(item)}
                                    >
                                        {importingKey === key ? '...' : 'Додати'}
                                    </button>
                                </div>
                            );
                        })}

                    {tab === 'nodes' &&
                        (data?.nodes ?? []).map((item) => {
                            const key = `n:${item.mapId}:${item.id}`;
                            return (
                                <div
                                    key={key}
                                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-base-200/50 border border-base-content/5"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{item.title}</p>
                                        <p className="text-xs opacity-50 truncate">
                                            {item.mapTitle}
                                            {item.groupTitle ? ` · ${item.groupTitle}` : ''}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-xs shrink-0"
                                        disabled={importingKey === key}
                                        onClick={() => handleImportNode(item)}
                                    >
                                        {importingKey === key ? '...' : 'Додати'}
                                    </button>
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
    );
}
