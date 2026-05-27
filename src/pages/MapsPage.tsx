import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MapCatalogToolbar from '../components/MapCatalog/MapCatalogToolbar';
import MapCatalogCard from '../components/MapCatalog/MapCatalogCard';
import { useMapCatalogList } from '../hooks/useMapCatalogList';

export default function MapsPage() {
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
    } = useMapCatalogList('catalog');

    if (authLoading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="mb-8">
                <h1 className="font-display text-3xl font-bold mb-2">Карти</h1>
                <p className="opacity-60 text-sm max-w-lg">
                    Усі опубліковані карти знань. Фільтруйте, сортуйте, додавайте в улюблені та
                    оцінюйте зірочками.
                </p>
            </div>

            <MapCatalogToolbar query={query} onChange={setQuery} maps={allMaps} />

            {loading && (
                <div className="text-center py-16 opacity-50">Завантаження карт...</div>
            )}

            {error && <div className="alert alert-error text-sm">{error}</div>}

            {!loading && !error && maps.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <p className="text-4xl mb-4">🗺️</p>
                    <h2 className="font-display text-xl font-bold mb-2">Карт не знайдено</h2>
                    <p className="opacity-60 text-sm">
                        Спробуйте змінити фільтри або дочекайтеся публікації нових карт.
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
