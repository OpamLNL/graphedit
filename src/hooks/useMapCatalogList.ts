import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    graphEditMapsApi,
    type GraphEditMap,
    type MapCatalogQuery,
    type MapListEngagement,
} from '../api/graphEditMaps';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { DEFAULT_CATALOG_QUERY } from '../components/MapCatalog/MapCatalogToolbar';

type FetchMode = 'catalog' | 'mine' | 'favorites';

export function useMapCatalogList(mode: FetchMode, lockedQuery?: Partial<MapCatalogQuery>) {
    const [query, setQuery] = useState<MapCatalogQuery>({
        ...DEFAULT_CATALOG_QUERY,
        ...lockedQuery,
    });
    const [maps, setMaps] = useState<GraphEditMap[]>([]);
    const [authorSource, setAuthorSource] = useState<GraphEditMap[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const effectiveQuery = useMemo(
        () => ({ ...query, ...lockedQuery }),
        [query, lockedQuery],
    );

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data =
                mode === 'mine'
                    ? await graphEditMapsApi.listMine(effectiveQuery)
                    : mode === 'favorites'
                      ? await graphEditMapsApi.listFavorites(effectiveQuery)
                      : await graphEditMapsApi.list(effectiveQuery);

            setMaps(data);

            if (!effectiveQuery.authorId && !effectiveQuery.search && !effectiveQuery.minRating) {
                setAuthorSource(data);
            }
        } catch (e) {
            setError(apiErrorMessage(e, 'Не вдалося завантажити карти'));
            setMaps([]);
        } finally {
            setLoading(false);
        }
    }, [mode, effectiveQuery]);

    useEffect(() => {
        void fetchList();
    }, [fetchList]);

    const updateMapEngagement = useCallback(
        (mapId: number, engagement: MapListEngagement) => {
            const patch = (list: GraphEditMap[]) =>
                list.map((m) => (m.id === mapId ? { ...m, engagement } : m));

            setAuthorSource((prev) => patch(prev));
            setMaps((prev) => {
                const next = patch(prev);
                if (effectiveQuery.favoritesOnly && !engagement.isFavorite) {
                    return next.filter((m) => m.id !== mapId);
                }
                return next;
            });
        },
        [effectiveQuery.favoritesOnly],
    );

    const handleFavorite = useCallback(
        async (mapId: number, favorite: boolean) => {
            const engagement = await graphEditMapsApi.setFavorite(mapId, favorite);
            updateMapEngagement(mapId, engagement);
        },
        [updateMapEngagement],
    );

    const handleRate = useCallback(
        async (mapId: number, rating: number | null) => {
            const engagement = await graphEditMapsApi.setRating(mapId, rating);
            updateMapEngagement(mapId, engagement);
        },
        [updateMapEngagement],
    );

    return {
        query,
        setQuery,
        allMaps: authorSource.length > 0 ? authorSource : maps,
        maps,
        loading,
        error,
        refetch: fetchList,
        handleFavorite,
        handleRate,
    };
}
