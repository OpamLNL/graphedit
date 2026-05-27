import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { graphEditMapsApi, type GraphEditMap } from '../api/graphEditMaps';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import MapGraphValidationBadge from '../components/MapGraphValidationBadge';
import MapCardMeta from '../components/MapCard/MapCardMeta';

export default function MyMapsPage() {
    const { user, role, loading: authLoading, token } = useAuth();
    const [maps, setMaps] = useState<GraphEditMap[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');

    const isEditor = role === 'admin' || role === 'teacher';

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

        graphEditMapsApi
            .listMine()
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

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        setCreating(true);
        setError(null);
        try {
            const map = await graphEditMapsApi.create({
                title: newTitle.trim(),
                description: newDesc.trim() || undefined,
            });
            setMaps((prev) => [map, ...prev]);
            setShowCreate(false);
            setNewTitle('');
            setNewDesc('');
            window.location.href = `/editor/${map.id}`;
        } catch (e) {
            setError(apiErrorMessage(e, 'Не вдалося створити карту'));
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (map: GraphEditMap) => {
        const confirmed = window.confirm(
            `Видалити карту «${map.title}»?\n\nУсі вузли, зображення та прогрес по цій карті буде втрачено.`,
        );
        if (!confirmed) return;

        setDeletingId(map.id);
        setError(null);
        try {
            await graphEditMapsApi.remove(map.id);
            setMaps((prev) => prev.filter((m) => m.id !== map.id));
        } catch (e) {
            setError(apiErrorMessage(e, 'Не вдалося видалити карту'));
        } finally {
            setDeletingId(null);
        }
    };

    if (authLoading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
                <div>
                    <h1 className="font-display text-3xl font-bold mb-2">Мої карти</h1>
                    <p className="opacity-60 text-sm max-w-lg">
                        Карти, які ви створили, та ті, що проходите або вже проходили.
                    </p>
                </div>
                {isEditor && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                        + Нова карта
                    </button>
                )}
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
                    <h2 className="font-display text-xl font-bold mb-2">Карт поки немає</h2>
                    <p className="opacity-60 text-sm mb-6">
                        {isEditor
                            ? 'Створіть першу карту знань або оберіть опубліковану карту з каталогу.'
                            : 'Оберіть карту з каталогу та почніть проходити теми — вона з\'явиться тут.'}
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                        <Link to="/maps" className="btn btn-outline btn-sm">
                            До каталогу карт
                        </Link>
                        {isEditor && (
                            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                                Створити карту
                            </button>
                        )}
                    </div>
                </div>
            )}

            {!loading && maps.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {maps.map((map) => {
                        const isOwner =
                            isEditor &&
                            (role === 'admin' || !map.ownerUid || map.ownerUid === user.uid);
                        return (
                            <MapCard
                                key={map.id}
                                map={map}
                                currentUserUid={user.uid}
                                canEdit={isOwner}
                                canDelete={isOwner}
                                deleting={deletingId === map.id}
                                onDelete={() => void handleDelete(map)}
                            />
                        );
                    })}
                </div>
            )}

            {showCreate && (
                <dialog className="modal modal-open">
                    <div className="modal-box">
                        <h3 className="font-display font-bold text-lg mb-4">Нова карта знань</h3>
                        <label className="form-control w-full mb-3">
                            <span className="label-text text-xs opacity-60">Назва</span>
                            <input
                                className="input input-bordered input-sm"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="Напр. Програмування Python"
                                autoFocus
                            />
                        </label>
                        <label className="form-control w-full mb-5">
                            <span className="label-text text-xs opacity-60">Опис (необов'язково)</span>
                            <textarea
                                className="textarea textarea-bordered textarea-sm"
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                                rows={2}
                            />
                        </label>
                        <div className="modal-action">
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>
                                Скасувати
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => void handleCreate()}
                                disabled={creating || !newTitle.trim()}
                            >
                                {creating ? 'Створення...' : 'Створити'}
                            </button>
                        </div>
                    </div>
                    <form method="dialog" className="modal-backdrop">
                        <button onClick={() => setShowCreate(false)}>close</button>
                    </form>
                </dialog>
            )}
        </div>
    );
}

function MapCard({
    map,
    currentUserUid,
    canEdit,
    canDelete,
    deleting,
    onDelete,
}: {
    map: GraphEditMap;
    currentUserUid: string;
    canEdit: boolean;
    canDelete: boolean;
    deleting: boolean;
    onDelete: () => void;
}) {
    const navigate = useNavigate();
    const updated = new Date(map.updatedAt).toLocaleDateString('uk-UA');
    const canView = map.status === 'published';
    const cardHref = canView ? `/map/${map.id}` : canEdit ? `/editor/${map.id}` : `/map/${map.id}`;

    return (
        <div className="glass-card p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors">
            <Link to={cardHref} className="flex flex-col gap-3 no-underline text-base-content flex-1">
                <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display font-bold text-base leading-snug">{map.title}</h2>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                            className={`badge badge-sm ${
                                map.status === 'published' ? 'badge-success' : 'badge-warning'
                            }`}
                        >
                            {map.status === 'published' ? 'published' : 'draft'}
                        </span>
                        <MapGraphValidationBadge map={map} />
                    </div>
                </div>

                {map.description && (
                    <p className="text-xs opacity-55 line-clamp-2">{map.description}</p>
                )}

                <MapCardMeta map={map} currentUserUid={currentUserUid} />

                <p className="text-[10px] opacity-40">Оновлено {updated}</p>
            </Link>

            <div className="flex gap-2 mt-auto pt-2">
                {canView && (
                    <Link to={`/map/${map.id}`} className="btn btn-outline btn-sm flex-1">
                        Переглянути
                    </Link>
                )}
                {canEdit && (
                    <button
                        type="button"
                        className="btn btn-primary btn-sm flex-1"
                        onClick={() => navigate(`/editor/${map.id}`)}
                    >
                        {canView ? 'Редагувати' : 'Відкрити редактор'}
                    </button>
                )}
                {!canView && !canEdit && (
                    <Link to={`/map/${map.id}`} className="btn btn-primary btn-sm flex-1">
                        Відкрити
                    </Link>
                )}
                {canDelete && (
                    <button
                        type="button"
                        className="btn btn-error btn-outline btn-sm shrink-0"
                        disabled={deleting}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        title="Видалити карту"
                    >
                        {deleting ? '...' : '×'}
                    </button>
                )}
            </div>
        </div>
    );
}
