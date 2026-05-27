import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { usersApi, type MapLearnersDetailData } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import {
    ProgressBar,
    ROLE_LABELS,
    StatCard,
    STATUS_LABELS,
    formatDate,
    statusBadgeClass,
} from '../../components/teaching/teachingUi';

export default function MapLearnersPage() {
    const { mapId: mapIdParam } = useParams();
    const mapId = Number(mapIdParam);
    const { user, role, loading: authLoading } = useAuth();
    const [data, setData] = useState<MapLearnersDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const isEditor = role === 'admin' || role === 'teacher';

    useEffect(() => {
        if (authLoading || !user || !isEditor || !Number.isFinite(mapId)) return;

        let cancelled = false;
        setLoading(true);
        usersApi
            .getMapLearners(mapId)
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch((e) => {
                if (!cancelled) setError(apiErrorMessage(e, 'Не вдалося завантажити дані'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user, authLoading, isEditor, mapId]);

    const filtered = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        if (!q) return data.learners;
        return data.learners.filter(
            (l) =>
                l.name.toLowerCase().includes(q) ||
                l.email.toLowerCase().includes(q) ||
                STATUS_LABELS[l.status].toLowerCase().includes(q),
        );
    }, [data, search]);

    if (!Number.isFinite(mapId)) {
        return <Navigate to="/teaching" replace />;
    }

    if (authLoading || loading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!isEditor) {
        return <Navigate to="/profile" replace />;
    }

    if (error) {
        return (
            <div className="max-w-lg mx-auto p-8 text-center">
                <p className="text-error mb-4">{error}</p>
                <Link to="/teaching" className="btn btn-primary btn-sm">
                    До статистики
                </Link>
            </div>
        );
    }

    if (!data) return null;

    const { map, teachingStats } = data;

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="mb-6">
                <Link to="/teaching" className="text-sm text-primary hover:underline">
                    ← Статистика карт
                </Link>
                <h1 className="font-display text-3xl font-bold mt-2 mb-1">{map.title}</h1>
                {map.description && (
                    <p className="opacity-60 text-sm max-w-2xl">{map.description}</p>
                )}
                <p className="text-xs opacity-40 mt-2">
                    Опубліковано {formatDate(map.publishedAt)} · оновлено {formatDate(map.updatedAt)}
                </p>
            </div>

            <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
                <StatCard label="Учнів" value={teachingStats.studentsTotal} />
                <StatCard label="Активних" value={teachingStats.studentsActive} accent />
                <StatCard label="Сер. прогрес" value={`${teachingStats.averagePercent}%`} accent />
                <StatCard label="Завершили" value={teachingStats.completionDistribution.completed} />
                <StatCard label="В процесі" value={teachingStats.completionDistribution.inProgress} />
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-display text-xl font-bold">Хто проходить</h2>
                <input
                    type="search"
                    className="input input-bordered input-sm w-full max-w-xs"
                    placeholder="Пошук учня..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {filtered.length === 0 ? (
                <div className="glass-card p-12 text-center opacity-70">
                    {data.learners.length === 0
                        ? 'Ще ніхто не розпочав проходження цієї карти.'
                        : 'За вашим запитом нічого не знайдено.'}
                </div>
            ) : (
                <div className="glass-card overflow-x-auto">
                    <table className="table table-sm w-full">
                        <thead>
                            <tr className="text-xs opacity-60">
                                <th>Користувач</th>
                                <th>Роль</th>
                                <th>Статус</th>
                                <th>Прогрес</th>
                                <th className="text-center">Теми</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((learner) => (
                                <tr key={learner.uid} className="hover:bg-base-200/30">
                                    <td>
                                        <div className="font-medium text-sm">{learner.name}</div>
                                        {learner.email && (
                                            <div className="text-xs opacity-45">{learner.email}</div>
                                        )}
                                    </td>
                                    <td>
                                        <span className="badge badge-xs badge-outline">
                                            {ROLE_LABELS[learner.role] ?? learner.role}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`badge badge-xs ${statusBadgeClass(learner.status)}`}>
                                            {STATUS_LABELS[learner.status]}
                                        </span>
                                    </td>
                                    <td className="min-w-[160px]">
                                        <ProgressBar
                                            percent={learner.percent}
                                            completed={learner.completed}
                                            total={learner.total}
                                            compact
                                        />
                                    </td>
                                    <td className="text-center text-xs opacity-60 whitespace-nowrap">
                                        ✅ {learner.completed} · 🔓 {learner.available} · 🔒{' '}
                                        {learner.locked}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
                <Link to="/teaching/users" className="btn btn-outline btn-sm">
                    Усі учні
                </Link>
                <Link to={`/map/${map.id}`} className="btn btn-ghost btn-sm">
                    Переглянути карту
                </Link>
            </div>
        </div>
    );
}
