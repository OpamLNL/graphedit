import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    topicsApi,
    type TopicCatalogItem,
    type TopicCatalogParams,
} from '../api/topics';
import { useAuth } from '../context/AuthContext';

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);
    return debounced;
}

export default function Topics() {
    const { role } = useAuth();
    const isEditor = role === 'admin' || role === 'teacher';

    const [search, setSearch] = useState('');
    const [mapId, setMapId] = useState<number | ''>('');
    const [publishedOnly, setPublishedOnly] = useState(true);
    const [usedOnly, setUsedOnly] = useState(true);
    const [sortBy, setSortBy] = useState<'title' | 'maps'>('title');
    const [page, setPage] = useState(1);

    const [items, setItems] = useState<TopicCatalogItem[]>([]);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(48);
    const [availableMaps, setAvailableMaps] = useState<
        { id: number; title: string; status: 'draft' | 'published' }[]
    >([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const debouncedSearch = useDebouncedValue(search, 300);

    const loadCatalog = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params: TopicCatalogParams = {
            search: debouncedSearch || undefined,
            mapId: mapId !== '' ? mapId : undefined,
            publishedOnly,
            usedOnly,
            sortBy,
            page,
            limit: 48,
        };
        try {
            const result = await topicsApi.getCatalog(params);
            setItems(result.data);
            setTotal(result.total);
            setLimit(result.limit);
            setAvailableMaps(result.availableMaps);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Помилка завантаження');
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, mapId, publishedOnly, usedOnly, sortBy, page]);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, mapId, publishedOnly, usedOnly, sortBy]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return (
        <div className="max-w-5xl mx-auto px-4 py-10">
            <div className="mb-8">
                <h1 className="font-display text-3xl font-bold mb-2">Каталог тем</h1>
                <p className="text-sm opacity-60 max-w-2xl">
                    Знайдіть тему та перегляньте, у яких картах знань вона зустрічається.
                    Пошук працює за назвою та описом.
                </p>
            </div>

            <div className="glass-card p-4 md:p-5 mb-6 space-y-4">
                <input
                    type="search"
                    placeholder="Пошук теми…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input input-bordered w-full"
                    autoComplete="off"
                />

                <div className="flex flex-wrap gap-3 items-end">
                    <label className="form-control flex-1 min-w-[180px]">
                        <span className="label-text text-xs opacity-60 mb-1">Карта</span>
                        <select
                            className="select select-bordered select-sm w-full"
                            value={mapId}
                            onChange={(e) =>
                                setMapId(e.target.value ? Number(e.target.value) : '')
                            }
                        >
                            <option value="">Усі карти</option>
                            {availableMaps.map((map) => (
                                <option key={map.id} value={map.id}>
                                    {map.title}
                                    {map.status === 'draft' ? ' (чернетка)' : ''}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="form-control min-w-[140px]">
                        <span className="label-text text-xs opacity-60 mb-1">Сортування</span>
                        <select
                            className="select select-bordered select-sm w-full"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'title' | 'maps')}
                        >
                            <option value="title">За назвою</option>
                            <option value="maps">За к-стю карт</option>
                        </select>
                    </label>

                    <label className="label cursor-pointer gap-2 py-1">
                        <input
                            type="checkbox"
                            className="checkbox checkbox-sm checkbox-primary"
                            checked={usedOnly}
                            onChange={(e) => setUsedOnly(e.target.checked)}
                        />
                        <span className="label-text text-xs">Лише з картами</span>
                    </label>

                    {isEditor && (
                        <label className="label cursor-pointer gap-2 py-1">
                            <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-primary"
                                checked={!publishedOnly}
                                onChange={(e) => setPublishedOnly(!e.target.checked)}
                            />
                            <span className="label-text text-xs">Включно з чернетками</span>
                        </label>
                    )}
                </div>
            </div>

            {!loading && !error && (
                <p className="text-xs opacity-45 mb-4">
                    Знайдено {total} {total === 1 ? 'тему' : total < 5 ? 'теми' : 'тем'}
                    {debouncedSearch ? ` за запитом «${debouncedSearch}»` : ''}
                </p>
            )}

            {loading && (
                <div className="text-center py-16 opacity-50">Завантаження тем…</div>
            )}

            {error && (
                <div className="glass-card p-8 text-center text-error">{error}</div>
            )}

            {!loading && !error && items.length === 0 && (
                <div className="glass-card p-10 text-center opacity-60">
                    Нічого не знайдено. Спробуйте інший запит або змініть фільтри.
                </div>
            )}

            {!loading && !error && items.length > 0 && (
                <ul className="space-y-2">
                    {items.map((topic) => {
                        const expanded = expandedId === topic.id;
                        return (
                            <li key={topic.id} className="glass-card overflow-hidden">
                                <button
                                    type="button"
                                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-base-200/40 transition-colors"
                                    onClick={() =>
                                        setExpandedId(expanded ? null : topic.id)
                                    }
                                >
                                    <span className="text-lg shrink-0 mt-0.5">
                                        {expanded ? '▼' : '▶'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold">{topic.title}</span>
                                            {topic.mapsCount > 0 ? (
                                                <span className="badge badge-primary badge-sm">
                                                    {topic.mapsCount}{' '}
                                                    {topic.mapsCount === 1 ? 'карта' : 'карти'}
                                                </span>
                                            ) : (
                                                <span className="badge badge-ghost badge-sm">
                                                    без карт
                                                </span>
                                            )}
                                        </div>
                                        {topic.description &&
                                            topic.description !== topic.title && (
                                                <p className="text-xs opacity-55 mt-1 line-clamp-2">
                                                    {topic.description}
                                                </p>
                                            )}
                                    </div>
                                </button>

                                {expanded && (
                                    <div className="px-4 pb-4 pt-0 border-t border-base-content/5">
                                        {topic.maps.length === 0 ? (
                                            <p className="text-sm opacity-50 pt-3">
                                                Тема не прив&apos;язана до жодної карти.
                                            </p>
                                        ) : (
                                            <ul className="pt-3 space-y-2">
                                                {topic.maps.map((ref) => (
                                                    <li
                                                        key={`${ref.mapId}-${ref.nodeId}`}
                                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-base-200/40 px-3 py-2"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium truncate">
                                                                {ref.mapTitle}
                                                            </p>
                                                            <p className="text-[10px] opacity-45 truncate">
                                                                вузол: {ref.nodeTitle}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span
                                                                className={`badge badge-xs ${
                                                                    ref.mapStatus === 'published'
                                                                        ? 'badge-success'
                                                                        : 'badge-warning'
                                                                }`}
                                                            >
                                                                {ref.mapStatus === 'published'
                                                                    ? 'опубліковано'
                                                                    : 'чернетка'}
                                                            </span>
                                                            <Link
                                                                to={`/map/${ref.mapId}`}
                                                                className="btn btn-primary btn-xs"
                                                            >
                                                                До карти
                                                            </Link>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {!loading && !error && totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8">
                    <button
                        className="btn btn-sm btn-outline"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        ← Назад
                    </button>
                    <span className="text-sm opacity-60">
                        {page} / {totalPages}
                    </span>
                    <button
                        className="btn btn-sm btn-outline"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                        Далі →
                    </button>
                </div>
            )}
        </div>
    );
}
