import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { graphEditMapsApi, type GraphEditMap } from '../api/graphEditMaps';
import MapGraphValidationBadge from '../components/MapGraphValidationBadge';
import MapCardMeta from '../components/MapCard/MapCardMeta';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../utils/apiErrorMessage';

export default function MapsPage() {
    const { user, loading: authLoading, token } = useAuth();
    const [maps, setMaps] = useState<GraphEditMap[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading) return;

        if (!user || !token) {
            setMaps([]);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        user
            .getIdToken()
            .then((freshToken) => {
                localStorage.setItem('token', freshToken);
                return graphEditMapsApi.list();
            })
            .then((data) => {
                if (cancelled) return;
                setMaps(data);
                setError(null);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(apiErrorMessage(e, 'Не вдалося завантажити карти'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user, authLoading, token]);

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
                    Усі опубліковані карти знань. Оберіть карту для перегляду та відстеження прогресу.
                </p>
            </div>

            {loading && (
                <div className="text-center py-16 opacity-50">Завантаження карт...</div>
            )}

            {error && (
                <div className="alert alert-error text-sm">{error}</div>
            )}

            {!loading && !error && maps.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <p className="text-4xl mb-4">🗺️</p>
                    <h2 className="font-display text-xl font-bold mb-2">Опублікованих карт поки немає</h2>
                    <p className="opacity-60 text-sm">
                        Коли викладач опублікує карту, вона з'явиться тут.
                    </p>
                </div>
            )}

            {!loading && maps.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {maps.map((map) => (
                        <CatalogMapCard key={map.id} map={map} currentUserUid={user.uid} />
                    ))}
                </div>
            )}
        </div>
    );
}

function CatalogMapCard({
    map,
    currentUserUid,
}: {
    map: GraphEditMap;
    currentUserUid: string;
}) {
    const updated = new Date(map.updatedAt).toLocaleDateString('uk-UA');

    return (
        <div className="glass-card p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between gap-2">
                <h2 className="font-display font-bold text-base leading-snug">{map.title}</h2>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="badge badge-sm badge-success">published</span>
                    <MapGraphValidationBadge map={map} />
                </div>
            </div>

            {map.description && (
                <p className="text-xs opacity-55 line-clamp-2">{map.description}</p>
            )}

            <MapCardMeta map={map} currentUserUid={currentUserUid} />

            <p className="text-[10px] opacity-40">Оновлено {updated}</p>

            <div className="flex gap-2 mt-auto pt-2">
                <Link to={`/map/${map.id}`} className="btn btn-primary btn-sm flex-1">
                    Переглянути
                </Link>
            </div>
        </div>
    );
}
