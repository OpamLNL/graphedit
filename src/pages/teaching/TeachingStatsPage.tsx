import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { usersApi, type TeachingOverviewData } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { StatCard, TeachingNav } from '../../components/teaching/teachingUi';

export default function TeachingStatsPage() {
    const { user, role, loading: authLoading } = useAuth();
    const [data, setData] = useState<TeachingOverviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isEditor = role === 'admin' || role === 'teacher';

    useEffect(() => {
        if (authLoading || !user || !isEditor) return;

        let cancelled = false;
        setLoading(true);
        usersApi
            .getTeachingOverview()
            .then((result) => {
                if (!cancelled) setData(result);
            })
            .catch((e) => {
                if (!cancelled) setError(apiErrorMessage(e, 'Не вдалося завантажити статистику'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [user, authLoading, isEditor]);

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

    const { summary, maps } = data;

    return (
        <div className="max-w-6xl mx-auto px-4 py-10">
            <div className="mb-6">
                <h1 className="font-display text-3xl font-bold mb-2">Статистика карт</h1>
                <p className="opacity-60 text-sm max-w-2xl">
                    Хто проходить ваші опубліковані карти та який прогрес по кожній з них.
                </p>
            </div>

            <TeachingNav active="stats" />

            <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard label="Опубліковано карт" value={summary.publishedMaps} />
                <StatCard label="Активних проходжень" value={summary.studentsActive} accent />
                <StatCard label="Сер. прогрес учнів" value={`${summary.averagePercent}%`} accent />
                <StatCard label="Завершили карту" value={summary.completedFully} />
            </section>

            {maps.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <p className="text-4xl mb-4">📊</p>
                    <h2 className="font-display text-xl font-bold mb-2">Немає опублікованих карт</h2>
                    <p className="opacity-60 text-sm mb-4">
                        Опублікуйте карту — тут з&apos;явиться статистика проходження.
                    </p>
                    <Link to="/my-maps" className="btn btn-primary btn-sm">
                        До моїх карт
                    </Link>
                </div>
            ) : (
                <div className="glass-card overflow-x-auto">
                    <table className="table table-sm w-full">
                        <thead>
                            <tr className="text-xs opacity-60">
                                <th>Карта</th>
                                <th className="text-center">Учнів</th>
                                <th className="text-center">Активних</th>
                                <th className="text-center">Сер. прогрес</th>
                                <th className="text-center">Завершили</th>
                                <th className="text-center">В процесі</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {maps.map((map) => {
                                const ts = map.teachingStats;
                                return (
                                    <tr key={map.id} className="hover:bg-base-200/30">
                                        <td>
                                            <div className="font-medium text-sm">{map.title}</div>
                                            {map.description && (
                                                <div className="text-xs opacity-45 line-clamp-1 max-w-xs">
                                                    {map.description}
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-center text-sm">{ts.studentsTotal}</td>
                                        <td className="text-center text-sm text-primary">
                                            {ts.studentsActive}
                                        </td>
                                        <td className="text-center text-sm font-semibold">
                                            {ts.averagePercent}%
                                        </td>
                                        <td className="text-center text-sm text-success">
                                            {ts.completionDistribution.completed}
                                        </td>
                                        <td className="text-center text-sm">
                                            {ts.completionDistribution.inProgress}
                                        </td>
                                        <td className="text-right">
                                            <Link
                                                to={`/teaching/maps/${map.id}`}
                                                className="btn btn-ghost btn-xs"
                                            >
                                                Деталі →
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
                <Link to="/teaching/users" className="btn btn-outline btn-sm">
                    Усі учні
                </Link>
                <Link to="/profile" className="btn btn-ghost btn-sm">
                    ← Кабінет
                </Link>
            </div>
        </div>
    );
}
