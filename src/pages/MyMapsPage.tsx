import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { knowledgeMapsApi, type KnowledgeMap } from '../api/knowledgeMaps';
import { useAuth } from '../context/AuthContext';

export default function MyMapsPage() {
    const { user, role, loading: authLoading } = useAuth();
    const [maps, setMaps] = useState<KnowledgeMap[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');

    const isEditor = role === 'admin' || role === 'teacher';

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        knowledgeMapsApi
            .listMine()
            .then(setMaps)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [user]);

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        setCreating(true);
        try {
            const map = await knowledgeMapsApi.create({
                title: newTitle.trim(),
                description: newDesc.trim() || undefined,
            });
            setMaps((prev) => [map, ...prev]);
            setShowCreate(false);
            setNewTitle('');
            setNewDesc('');
            window.location.href = `/editor/${map.id}`;
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
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
                    {maps.map((map) => (
                        <MapCard
                            key={map.id}
                            map={map}
                            canEdit={
                                isEditor &&
                                (!map.ownerUid || map.ownerUid === user.uid)
                            }
                        />
                    ))}
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
                                onClick={handleCreate}
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

function MapCard({ map, canEdit }: { map: KnowledgeMap; canEdit: boolean }) {
    const navigate = useNavigate();
    const updated = new Date(map.updatedAt).toLocaleDateString('uk-UA');
    const canView = map.status === 'published';
    const cardHref = canView ? `/map/${map.id}` : canEdit ? `/editor/${map.id}` : `/map/${map.id}`;

    return (
        <Link
            to={cardHref}
            className="glass-card p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors no-underline text-base-content cursor-pointer"
        >
            <div className="flex items-start justify-between gap-2">
                <h2 className="font-display font-bold text-base leading-snug">{map.title}</h2>
                <span
                    className={`badge badge-sm shrink-0 ${
                        map.status === 'published' ? 'badge-success' : 'badge-warning'
                    }`}
                >
                    {map.status === 'published' ? 'published' : 'draft'}
                </span>
            </div>

            {map.description && (
                <p className="text-xs opacity-55 line-clamp-2">{map.description}</p>
            )}

            <p className="text-[10px] opacity-40">Оновлено {updated}</p>

            <div className="flex gap-2 mt-auto pt-2">
                {canView && (
                    <span className="btn btn-outline btn-sm flex-1 pointer-events-none">
                        Переглянути
                    </span>
                )}
                {canEdit && (
                    <button
                        type="button"
                        className="btn btn-primary btn-sm flex-1"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/editor/${map.id}`);
                        }}
                    >
                        {canView ? 'Редагувати' : 'Відкрити редактор'}
                    </button>
                )}
                {!canView && !canEdit && (
                    <span className="btn btn-primary btn-sm flex-1 pointer-events-none">
                        Відкрити
                    </span>
                )}
            </div>
        </Link>
    );
}
