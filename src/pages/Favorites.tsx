import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MapCatalogToolbar from '../components/MapCatalog/MapCatalogToolbar';
import MapCatalogCard from '../components/MapCatalog/MapCatalogCard';
import { useMapCatalogList } from '../hooks/useMapCatalogList';

export default function FavoritesPage() {
    const { user, loading: authLoading } = useAuth();
    const {
        query,
        setQuery,
        allMaps,
        maps,
        loading,
        error,
        handleFavorite,
        handleRate,
    } = useMapCatalogList('favorites', { favoritesOnly: true });

    if (authLoading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="mb-8">
                <h1 className="font-display text-3xl font-bold mb-2">Улюблені карти</h1>
                <p className="opacity-60 text-sm max-w-lg">
                    Карти, які ви додали в улюблені. Сортуйте за датою додавання, рейтингом або
                    назвою.
                </p>
            </div>

            <MapCatalogToolbar
                query={query}
                onChange={setQuery}
                maps={allMaps}
                lockedFavoritesOnly
                showFavoritesFilter={false}
            />

            {loading && (
                <div className="text-center py-16 opacity-50">Завантаження...</div>
            )}

            {error && <div className="alert alert-error text-sm">{error}</div>}

            {!loading && !error && maps.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <p className="text-4xl mb-4">♡</p>
                    <h2 className="font-display text-xl font-bold mb-2">Улюблених карт поки немає</h2>
                    <p className="opacity-60 text-sm">
                        Натисніть сердечко на картці в каталозі, щоб додати карту сюди.
                    </p>
                </div>
            )}

            {!loading && maps.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {maps.map((map) => (
                        <MapCatalogCard
                            key={map.id}
                            map={map}
                            currentUserUid={user.uid}
                            onFavorite={handleFavorite}
                            onRate={handleRate}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
