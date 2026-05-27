import { useMemo, useState } from 'react';
import type { GraphEditMap, MapCatalogQuery, MapCatalogSortBy, MapCatalogSortOrder } from '../api/graphEditMaps';

export const DEFAULT_CATALOG_QUERY: MapCatalogQuery = {
    sortBy: 'updatedAt',
    sortOrder: 'desc',
};

export const SORT_OPTIONS: { value: MapCatalogSortBy; label: string }[] = [
    { value: 'updatedAt', label: 'Дата оновлення' },
    { value: 'publishedAt', label: 'Дата публікації' },
    { value: 'createdAt', label: 'Дата створення' },
    { value: 'title', label: 'Алфавіт (назва)' },
    { value: 'rating', label: 'Рейтинг' },
    { value: 'favorites', label: 'Популярність (улюблені)' },
    { value: 'favoritedAt', label: 'Дата додавання в улюблене' },
];

interface MapCatalogToolbarProps {
    query: MapCatalogQuery;
    onChange: (next: MapCatalogQuery) => void;
    maps?: GraphEditMap[];
    showStatusFilter?: boolean;
    showFavoritesFilter?: boolean;
    lockedFavoritesOnly?: boolean;
}

export default function MapCatalogToolbar({
    query,
    onChange,
    maps = [],
    showStatusFilter = false,
    showFavoritesFilter = true,
    lockedFavoritesOnly = false,
}: MapCatalogToolbarProps) {
    const [searchDraft, setSearchDraft] = useState(query.search ?? '');

    const authors = useMemo(() => {
        const byId = new Map<number, string>();
        for (const map of maps) {
            if (map.author.id != null) {
                byId.set(map.author.id, map.author.displayName);
            }
        }
        return [...byId.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    }, [maps]);

    const patch = (partial: Partial<MapCatalogQuery>) => {
        onChange({ ...query, ...partial });
    };

    const applySearch = () => {
        patch({ search: searchDraft.trim() || undefined });
    };

    return (
        <div className="glass-card p-4 mb-6 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3">
                <label className="form-control flex-1">
                    <span className="label-text text-xs opacity-60 mb-1">Пошук</span>
                    <div className="join w-full">
                        <input
                            className="input input-bordered input-sm join-item flex-1"
                            placeholder="Назва, опис або автор..."
                            value={searchDraft}
                            onChange={(e) => setSearchDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') applySearch();
                            }}
                        />
                        <button type="button" className="btn btn-primary btn-sm join-item" onClick={applySearch}>
                            Знайти
                        </button>
                    </div>
                </label>

                <label className="form-control w-full lg:w-52">
                    <span className="label-text text-xs opacity-60 mb-1">Сортування</span>
                    <select
                        className="select select-bordered select-sm"
                        value={query.sortBy ?? 'updatedAt'}
                        onChange={(e) => patch({ sortBy: e.target.value as MapCatalogSortBy })}
                    >
                        {SORT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="form-control w-full lg:w-36">
                    <span className="label-text text-xs opacity-60 mb-1">Порядок</span>
                    <select
                        className="select select-bordered select-sm"
                        value={query.sortOrder ?? 'desc'}
                        onChange={(e) => patch({ sortOrder: e.target.value as MapCatalogSortOrder })}
                    >
                        <option value="desc">Спадання</option>
                        <option value="asc">Зростання</option>
                    </select>
                </label>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
                <label className="form-control w-full sm:w-40">
                    <span className="label-text text-xs opacity-60 mb-1">Мін. рейтинг</span>
                    <select
                        className="select select-bordered select-sm"
                        value={query.minRating ?? ''}
                        onChange={(e) =>
                            patch({
                                minRating: e.target.value ? Number(e.target.value) : undefined,
                            })
                        }
                    >
                        <option value="">Будь-який</option>
                        {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                                {n}+ зірок
                            </option>
                        ))}
                    </select>
                </label>

                {authors.length > 0 && (
                    <label className="form-control w-full sm:w-52">
                        <span className="label-text text-xs opacity-60 mb-1">Автор</span>
                        <select
                            className="select select-bordered select-sm"
                            value={query.authorId ?? ''}
                            onChange={(e) =>
                                patch({
                                    authorId: e.target.value ? Number(e.target.value) : undefined,
                                })
                            }
                        >
                            <option value="">Усі автори</option>
                            {authors.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

                {showStatusFilter && (
                    <label className="form-control w-full sm:w-40">
                        <span className="label-text text-xs opacity-60 mb-1">Статус</span>
                        <select
                            className="select select-bordered select-sm"
                            value={query.status ?? ''}
                            onChange={(e) =>
                                patch({
                                    status: (e.target.value as 'draft' | 'published') || undefined,
                                })
                            }
                        >
                            <option value="">Усі</option>
                            <option value="published">Опубліковані</option>
                            <option value="draft">Чернетки</option>
                        </select>
                    </label>
                )}

                <label className="label cursor-pointer gap-2 py-1">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={lockedFavoritesOnly || !!query.favoritesOnly}
                        disabled={lockedFavoritesOnly || !showFavoritesFilter}
                        onChange={(e) => patch({ favoritesOnly: e.target.checked || undefined })}
                    />
                    <span className="label-text text-sm">Лише улюблені</span>
                </label>

                <label className="label cursor-pointer gap-2 py-1">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={!!query.validatedOnly}
                        onChange={(e) => patch({ validatedOnly: e.target.checked || undefined })}
                    />
                    <span className="label-text text-sm">Лише валідовані</span>
                </label>

                <button
                    type="button"
                    className="btn btn-ghost btn-sm ml-auto"
                    onClick={() => {
                        setSearchDraft('');
                        onChange({ ...DEFAULT_CATALOG_QUERY });
                    }}
                >
                    Скинути фільтри
                </button>
            </div>
        </div>
    );
}
