import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { usersApi, type PublicUserProfile } from '../api/users';
import { apiAssetUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import { ROLE_LABELS, formatDate } from '../components/teaching/teachingUi';

export default function UserPublicProfilePage() {
    const { userId: userIdParam } = useParams();
    const userId = Number(userIdParam);
    const { user, loading: authLoading } = useAuth();
    const [profile, setProfile] = useState<PublicUserProfile | null>(null);
    const [myUserId, setMyUserId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            setMyUserId(null);
            return;
        }
        usersApi
            .me()
            .then((me) => setMyUserId(me.id))
            .catch(() => setMyUserId(null));
    }, [user]);

    useEffect(() => {
        if (authLoading) return;
        if (!Number.isFinite(userId)) {
            setLoading(false);
            return;
        }

        if (myUserId != null && myUserId === userId) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        usersApi
            .getPublicProfile(userId)
            .then((data) => {
                if (!cancelled) setProfile(data);
            })
            .catch((e) => {
                if (!cancelled) setError(apiErrorMessage(e, 'Не вдалося завантажити профіль'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [userId, authLoading, myUserId]);

    if (myUserId != null && myUserId === userId) {
        return <Navigate to="/profile" replace />;
    }

    if (authLoading || loading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!Number.isFinite(userId)) {
        return <Navigate to="/maps" replace />;
    }

    if (error) {
        return (
            <div className="max-w-lg mx-auto p-8 text-center">
                <p className="text-error mb-4">{error}</p>
                <Link to="/maps" className="btn btn-primary btn-sm">
                    До карт
                </Link>
            </div>
        );
    }

    if (!profile) return null;

    const avatarUrl = profile.avatarUrl?.startsWith('/api/')
        ? apiAssetUrl(profile.avatarUrl)
        : profile.avatarUrl;

    return (
        <div className="max-w-4xl mx-auto px-4 py-10">
            <Link to="/maps" className="text-sm text-primary hover:underline">
                ← Карти
            </Link>

            <section className="glass-card p-6 md:p-8 mt-4 mb-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="avatar shrink-0">
                        <div className="w-20 h-20 rounded-full ring-4 ring-primary/20 overflow-hidden bg-base-200">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl font-display font-bold text-primary">
                                    {profile.name.charAt(0).toUpperCase()}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 text-center sm:text-left">
                        <h1 className="font-display text-2xl md:text-3xl font-bold">{profile.name}</h1>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                            <span className="badge badge-primary badge-outline">
                                {ROLE_LABELS[profile.role] ?? profile.role}
                            </span>
                            <span className="text-xs opacity-45">
                                У системі з {formatDate(profile.createdAt)}
                            </span>
                        </div>
                        <p className="text-sm opacity-60 mt-3">
                            Опублікованих карт: {profile.stats.publishedMapsCount}
                        </p>
                    </div>
                </div>
            </section>

            <section>
                <h2 className="font-display text-xl font-bold mb-4">Опубліковані карти</h2>

                {profile.publishedMaps.length === 0 ? (
                    <div className="glass-card p-10 text-center opacity-60">
                        У цього автора поки немає опублікованих карт.
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                        {profile.publishedMaps.map((map) => (
                            <Link
                                key={map.id}
                                to={`/map/${map.id}`}
                                className="glass-card p-5 hover:border-primary/30 transition-colors no-underline text-base-content"
                            >
                                <h3 className="font-display font-bold text-base mb-2">{map.title}</h3>
                                {map.description && (
                                    <p className="text-xs opacity-55 line-clamp-2 mb-3">
                                        {map.description}
                                    </p>
                                )}
                                <p className="text-[10px] opacity-40">
                                    Оновлено {formatDate(map.updatedAt)}
                                </p>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
