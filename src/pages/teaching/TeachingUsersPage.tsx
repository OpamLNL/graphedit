import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { usersApi, type TeachingLearnersData } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import {
    ProgressBar,
    ROLE_LABELS,
    StatCard,
    STATUS_LABELS,
    TeachingNav,
    statusBadgeClass,
} from '../../components/teaching/teachingUi';

export default function TeachingUsersPage() {
    const { user, role, loading: authLoading } = useAuth();
    const [data, setData] = useState<TeachingLearnersData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [expandedUid, setExpandedUid] = useState<string | null>(null);

    const isEditor = role === 'admin' || role === 'teacher';

    useEffect(() => {
        if (authLoading || !user || !isEditor) return;

        let cancelled = false;
        setLoading(true);
        usersApi
            .getTeachingLearners()
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch((e) => {
                if (!cancelled) setError(apiErrorMessage(e, 'Не вдалося завантажити учнів'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user, authLoading, isEditor]);

    const filtered = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        if (!q) return data.learners;
        return data.learners.filter(
            (l) =>
                l.name.toLowerCase().includes(q) ||
                l.email.toLowerCase().includes(q) ||
                ROLE_LABELS[l.role]?.toLowerCase().includes(q),
        );
    }, [data, search]);

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
                <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
                    Спробувати знову
                </button>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="mb-6">
                <h1 className="font-display text-3xl font-bold mb-2">Учні</h1>
                <p className="opacity-60 text-sm max-w-2xl">
                    Користувачі, які проходять ваші карти, з прогресом по кожній карті.
                </p>
            </div>

            <TeachingNav active="users" />

            <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <StatCard label="Унікальних учнів" value={data.summary.totalLearners} />
                <StatCard label="Активних" value={data.summary.activeLearners} accent />
                <StatCard label="Ваших карт" value={data.summary.publishedMaps} />
            </section>

            <div className="mb-4">
                <input
                    type="search"
                    className="input input-bordered input-sm w-full max-w-md"
                    placeholder="Пошук за ім'ям або email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {filtered.length === 0 ? (
                <div className="glass-card p-12 text-center opacity-70">
                    {data.learners.length === 0
                        ? 'Ще ніхто не проходив ваші карти.'
                        : 'За вашим запитом нічого не знайдено.'}
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((learner) => {
                        const expanded = expandedUid === learner.uid;
                        return (
                            <div key={learner.uid} className="glass-card overflow-hidden">
                                <button
                                    type="button"
                                    className="w-full flex flex-wrap items-center gap-3 p-4 text-left hover:bg-base-200/20 transition-colors"
                                    onClick={() =>
                                        setExpandedUid(expanded ? null : learner.uid)
                                    }
                                >
                                    <div className="w-10 h-10 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0">
                                        {learner.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{learner.name}</div>
                                        <div className="text-xs opacity-50 truncate">
                                            {learner.email || '—'}
                                        </div>
                                    </div>
                                    <span className="badge badge-sm badge-outline">
                                        {ROLE_LABELS[learner.role] ?? learner.role}
                                    </span>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-semibold text-primary">
                                            {learner.averagePercent}%
                                        </div>
                                        <div className="text-[10px] opacity-45">
                                            {learner.mapsCount} карт
                                        </div>
                                    </div>
                                    <span className="text-xs opacity-40">{expanded ? '▲' : '▼'}</span>
                                </button>

                                {expanded && (
                                    <div className="border-t border-base-content/5 px-4 pb-4">
                                        <div className="grid sm:grid-cols-2 gap-3 pt-3">
                                            {learner.maps.map((map) => (
                                                <div
                                                    key={`${learner.uid}-${map.mapId}`}
                                                    className="rounded-xl border border-base-content/10 p-3 bg-base-200/20"
                                                >
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <Link
                                                            to={`/teaching/maps/${map.mapId}`}
                                                            className="text-sm font-medium hover:text-primary line-clamp-2"
                                                        >
                                                            {map.mapTitle}
                                                        </Link>
                                                        <span
                                                            className={`badge badge-xs shrink-0 ${statusBadgeClass(map.status)}`}
                                                        >
                                                            {STATUS_LABELS[map.status]}
                                                        </span>
                                                    </div>
                                                    <ProgressBar
                                                        percent={map.percent}
                                                        completed={map.completed}
                                                        total={map.total}
                                                        compact
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="mt-6">
                <Link to="/teaching" className="btn btn-ghost btn-sm">
                    ← Статистика карт
                </Link>
            </div>
        </div>
    );
}
