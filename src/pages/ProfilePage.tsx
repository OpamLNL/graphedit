import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { usersApi, type CabinetData } from '../api/users';
import { apiAssetUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { loadStoredNavigation, navigationStorageKey } from '../utils/graphNavigationStorage';

const ROLE_LABELS: Record<string, string> = {
    admin: 'Адміністратор',
    teacher: 'Викладач',
    student: 'Студент',
    guest: 'Гість',
};

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleString('uk-UA', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function ProfilePage() {
    const { user, role, loading: authLoading, avatarUrl: authAvatarUrl, refreshProfile, profileName } = useAuth();
    const [cabinet, setCabinet] = useState<CabinetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarError, setAvatarError] = useState<string | null>(null);
    const [grantEmail, setGrantEmail] = useState('');
    const [grantLoading, setGrantLoading] = useState(false);
    const [grantMessage, setGrantMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isEditor = role === 'admin' || role === 'teacher';
    const displayName = cabinet?.user.name ?? profileName ?? user?.displayName ?? 'Користувач';

    const resolveProfileAvatar = (cabinetAvatar: string | null | undefined) => {
        const url = cabinetAvatar ?? authAvatarUrl ?? user?.photoURL ?? null;
        if (!url) return null;
        if (url.startsWith('/api/')) return apiAssetUrl(url);
        return url;
    };

    const avatarUrl = resolveProfileAvatar(cabinet?.user.avatarUrl);
    const hasCustomAvatar =
        !!cabinet?.user.avatarUrl?.startsWith('/api/uploads/avatars/');

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        usersApi
            .getCabinet()
            .then(setCabinet)
            .catch((e) => setError(e.message ?? 'Помилка завантаження'))
            .finally(() => setLoading(false));
    }, [user]);

    if (authLoading || loading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
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

    if (!cabinet) return null;

    const handleAvatarSelect = async (file: File | null) => {
        if (!file) return;
        setAvatarUploading(true);
        setAvatarError(null);
        try {
            const updated = await usersApi.uploadAvatar(file);
            setCabinet((prev) =>
                prev ? { ...prev, user: { ...prev.user, avatarUrl: updated.avatarUrl } } : prev,
            );
            await refreshProfile();
        } catch (e) {
            setAvatarError(e instanceof Error ? e.message : 'Не вдалося завантажити фото');
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleAvatarReset = async () => {
        setAvatarUploading(true);
        setAvatarError(null);
        try {
            const updated = await usersApi.removeAvatar();
            setCabinet((prev) =>
                prev ? { ...prev, user: { ...prev.user, avatarUrl: updated.avatarUrl } } : prev,
            );
            await refreshProfile();
        } catch (e) {
            setAvatarError(e instanceof Error ? e.message : 'Не вдалося скинути фото');
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleGrantTeacher = async () => {
        const email = grantEmail.trim();
        if (!email) return;
        setGrantLoading(true);
        setGrantMessage(null);
        try {
            const result = await usersApi.grantTeacherRole(email);
            setGrantMessage({ type: 'success', text: `${result.message}: ${result.name} (${result.email})` });
            setGrantEmail('');
        } catch (e) {
            setGrantMessage({
                type: 'error',
                text: e instanceof Error ? e.message : 'Не вдалося надати роль',
            });
        } finally {
            setGrantLoading(false);
        }
    };

    const { stats, maps, recentCompleted, teachingStats } = cabinet;
    const profileRole = cabinet.user.role ?? role ?? 'student';
    const showTeachingStats = isEditor && teachingStats != null;

    const ownedPublishedWithStats = maps.filter(
        (m) =>
            m.status === 'published' &&
            m.teachingStats &&
            (!m.ownerUid || m.ownerUid === user.uid),
    );

    const statCards = showTeachingStats
        ? [
              {
                  label: 'Опубліковано карт',
                  value: teachingStats.publishedMaps,
                  color: '',
              },
              {
                  label: 'Активних проходжень',
                  value: teachingStats.studentsActive,
                  color: 'text-primary',
              },
              {
                  label: 'Сер. прогрес студентів',
                  value: `${teachingStats.averagePercent}%`,
                  color: 'text-primary',
              },
              {
                  label: 'Завершили карту',
                  value: teachingStats.completedFully,
                  color: 'text-success',
              },
          ]
        : [
              {
                  label: 'Вивчено тем',
                  value: stats.totalCompletedTopics,
                  color: 'text-success',
              },
              {
                  label: 'Середній прогрес',
                  value: `${stats.averagePercent}%`,
                  color: 'text-primary',
              },
              {
                  label: 'Карт доступно',
                  value: stats.mapsTotal,
                  color: '',
              },
              {
                  label: 'З прогресом',
                  value: stats.mapsWithProgress,
                  color: 'opacity-80',
              },
          ];

    return (
        <div className="max-w-5xl mx-auto px-4 py-10">
            <section className="glass-card p-6 md:p-8 mb-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div className="avatar shrink-0 relative group">
                        <div className="w-24 h-24 rounded-full ring-4 ring-primary/25 overflow-hidden bg-base-200">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-3xl font-display font-bold text-primary">
                                    {displayName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            {avatarUploading && (
                                <div className="absolute inset-0 bg-base-300/70 flex items-center justify-center">
                                    <span className="loading loading-spinner loading-sm text-primary" />
                                </div>
                            )}
                        </div>
                        <label
                            className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${
                                avatarUploading ? 'pointer-events-none' : ''
                            }`}
                            title="Змінити фото"
                        >
                            <span className="text-white text-xs font-medium">📷</span>
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                className="hidden"
                                disabled={avatarUploading}
                                onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null;
                                    void handleAvatarSelect(file);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    </div>

                    <div className="flex-1 text-center sm:text-left min-w-0">
                        <h1 className="font-display text-2xl md:text-3xl font-bold mb-1 truncate">
                            {displayName}
                        </h1>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                            <span className="badge badge-primary badge-outline">
                                {ROLE_LABELS[profileRole] ?? profileRole}
                            </span>
                            <span className="text-xs opacity-45">
                                У системі з {formatDate(cabinet.user.createdAt)}
                            </span>
                        </div>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                            <label className={`btn btn-outline btn-xs ${avatarUploading ? 'btn-disabled' : ''}`}>
                                Змінити фото
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    className="hidden"
                                    disabled={avatarUploading}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null;
                                        void handleAvatarSelect(file);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                            {hasCustomAvatar && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-xs"
                                    disabled={avatarUploading}
                                    onClick={() => void handleAvatarReset()}
                                >
                                    Скинути фото
                                </button>
                            )}
                        </div>
                        {avatarError && (
                            <p className="text-xs text-error mt-2">{avatarError}</p>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                        <Link to="/my-maps" className="btn btn-primary btn-sm">
                            Мої карти
                        </Link>
                        {isEditor && (
                            <Link to="/my-maps" className="btn btn-outline btn-sm">
                                + Нова карта
                            </Link>
                        )}
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {statCards.map((s) => (
                    <div key={s.label} className="glass-card p-4 text-center">
                        <div className={`text-2xl md:text-3xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs opacity-55 mt-1">{s.label}</div>
                    </div>
                ))}
            </section>

            {showTeachingStats && ownedPublishedWithStats.length > 0 && (
                <section className="mb-8">
                    <h2 className="font-display text-xl font-bold mb-2">
                        Проходження студентами
                    </h2>
                    <p className="text-sm opacity-55 mb-4">
                        Статистика по опублікованих картах, які ви створили
                    </p>
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
                                </tr>
                            </thead>
                            <tbody>
                                {ownedPublishedWithStats.map((map) => {
                                    const ts = map.teachingStats!;
                                    return (
                                        <tr key={map.id} className="hover:bg-base-200/30">
                                            <td>
                                                <Link
                                                    to={`/map/${map.id}`}
                                                    className="font-medium text-sm hover:text-primary"
                                                >
                                                    {map.title}
                                                </Link>
                                            </td>
                                            <td className="text-center text-sm">
                                                {ts.studentsTotal}
                                            </td>
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
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {ownedPublishedWithStats.some((m) => m.teachingStats!.topStudents.length > 0) && (
                        <div className="mt-4 space-y-4">
                            {ownedPublishedWithStats
                                .filter((m) => m.teachingStats!.topStudents.length > 0)
                                .map((map) => (
                                    <div key={map.id} className="glass-card p-4">
                                        <h3 className="font-display font-semibold text-sm mb-3">
                                            {map.title} — учні
                                        </h3>
                                        <ul className="divide-y divide-base-content/5">
                                            {map.teachingStats!.topStudents.map((student, index) => (
                                                <li
                                                    key={`${student.email || student.name}-${index}`}
                                                    className="flex items-center justify-between gap-3 py-2 text-sm"
                                                >
                                                    <span className="truncate opacity-80">
                                                        {student.name}
                                                        {student.email && (
                                                            <span className="text-xs opacity-45 ml-2">
                                                                {student.email}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="shrink-0 font-medium">
                                                        {student.completed}/{student.total} ·{' '}
                                                        {student.percent}%
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                        </div>
                    )}
                </section>
            )}

            {isEditor && (
                <section className="glass-card p-5 md:p-6 mb-8">
                    <h2 className="font-display text-xl font-bold mb-1">Надати роль викладача</h2>
                    <p className="text-sm opacity-55 mb-4">
                        Введіть email користувача, який уже увійшов у систему. Йому буде надано доступ до редактора карт.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                        <input
                            type="email"
                            className="input input-bordered input-sm flex-1"
                            placeholder="email@example.com"
                            value={grantEmail}
                            onChange={(e) => setGrantEmail(e.target.value)}
                            disabled={grantLoading}
                        />
                        <button
                            type="button"
                            className="btn btn-primary btn-sm shrink-0"
                            onClick={() => void handleGrantTeacher()}
                            disabled={grantLoading || !grantEmail.trim()}
                        >
                            {grantLoading ? 'Надання...' : 'Надати викладача'}
                        </button>
                    </div>
                    {grantMessage && (
                        <p
                            className={`text-sm mt-3 ${
                                grantMessage.type === 'success' ? 'text-success' : 'text-error'
                            }`}
                        >
                            {grantMessage.text}
                        </p>
                    )}
                </section>
            )}

            <section className="mb-8">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <h2 className="font-display text-xl font-bold">
                        {isEditor ? 'Мої карти знань' : 'Прогрес по картах'}
                    </h2>
                    <Link to="/maps" className="text-sm text-primary hover:underline">
                        Усі карти →
                    </Link>
                </div>

                {maps.length === 0 ? (
                    <div className="glass-card p-10 text-center opacity-60">
                        {isEditor
                            ? 'Ще немає створених карт. Створіть першу на сторінці «Мої карти».'
                            : 'Немає карт з прогресом. Оберіть карту з каталогу «Карти».'}
                    </div>
                ) : (
                    <div className="grid sm:grid-cols-2 gap-4">
                        {maps.map((map) => (
                            <MapProgressCard
                                key={map.id}
                                map={map}
                                isEditor={isEditor}
                                isOwner={!map.ownerUid || map.ownerUid === user.uid}
                            />
                        ))}
                    </div>
                )}
            </section>

            {recentCompleted.length > 0 && (
                <section>
                    <h2 className="font-display text-xl font-bold mb-4">Остання активність</h2>
                    <ul className="glass-card divide-y divide-base-content/5 overflow-hidden">
                        {recentCompleted.map((item) => (
                            <li
                                key={`${item.topicId}-${item.completedAt}`}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-base-200/30 transition-colors"
                            >
                                <span className="text-lg shrink-0">✅</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{item.title}</p>
                                    <p className="text-xs opacity-45">
                                        {formatDateTime(item.completedAt)}
                                    </p>
                                </div>
                                {item.mapId != null && (
                                    <Link
                                        to={`/map/${item.mapId}`}
                                        className="btn btn-ghost btn-xs shrink-0"
                                    >
                                        До карти
                                    </Link>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function MapProgressCard({
    map,
    isEditor,
    isOwner,
}: {
    map: CabinetData['maps'][number];
    isEditor: boolean;
    isOwner: boolean;
}) {
    const hasStoredNav = !!loadStoredNavigation(navigationStorageKey(map.id, 'view'));
    const updated = formatDate(map.updatedAt);
    const canView = map.status === 'published' || isEditor;
    const canEdit = isEditor && isOwner;

    return (
        <div className="glass-card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-bold text-base leading-snug">{map.title}</h3>
                <span
                    className={`badge badge-sm shrink-0 ${
                        map.status === 'published' ? 'badge-success' : 'badge-warning'
                    }`}
                >
                    {map.status === 'published' ? 'опубліковано' : 'чернетка'}
                </span>
            </div>

            {map.description && (
                <p className="text-xs opacity-55 line-clamp-2">{map.description}</p>
            )}

            {map.teachingStats && map.status === 'published' && isOwner && (
                <div className="rounded-xl border border-base-content/10 bg-base-200/30 p-3 space-y-2">
                    <p className="text-xs font-semibold opacity-70">Проходження студентами</p>
                    <div className="flex justify-between text-xs">
                        <span className="opacity-60">Сер. прогрес</span>
                        <span className="font-semibold text-primary">
                            {map.teachingStats.averagePercent}%
                        </span>
                    </div>
                    <progress
                        className="progress progress-success w-full h-1.5"
                        value={map.teachingStats.averagePercent}
                        max={100}
                    />
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-center">
                        <div>
                            <div className="font-bold">{map.teachingStats.studentsActive}</div>
                            <div className="opacity-45">активних</div>
                        </div>
                        <div>
                            <div className="font-bold">
                                {map.teachingStats.completionDistribution.inProgress}
                            </div>
                            <div className="opacity-45">в процесі</div>
                        </div>
                        <div>
                            <div className="font-bold text-success">
                                {map.teachingStats.completionDistribution.completed}
                            </div>
                            <div className="opacity-45">завершили</div>
                        </div>
                    </div>
                    {map.teachingStats.topStudents.length > 0 && (
                        <ul className="pt-1 space-y-1 border-t border-base-content/5">
                            {map.teachingStats.topStudents.map((student, index) => (
                                <li
                                    key={`${student.name}-${index}`}
                                    className="flex items-center justify-between gap-2 text-[10px]"
                                >
                                    <span className="truncate opacity-70">{student.name}</span>
                                    <span className="shrink-0 font-medium">
                                        {student.completed}/{student.total} · {student.percent}%
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {map.progress && !(map.teachingStats && isOwner) ? (
                <div>
                    <div className="flex justify-between text-xs mb-1.5">
                        <span className="opacity-60">
                            {map.progress.completed} / {map.progress.total} тем
                        </span>
                        <span className="font-semibold text-primary">{map.progress.percent}%</span>
                    </div>
                    <progress
                        className="progress progress-primary w-full h-2"
                        value={map.progress.percent}
                        max={100}
                    />
                    <div className="flex gap-3 mt-2 text-[10px] opacity-45">
                        <span>✅ {map.progress.completed}</span>
                        <span>🔓 {map.progress.available}</span>
                        <span>🔒 {map.progress.locked}</span>
                    </div>
                </div>
            ) : !map.teachingStats || !isOwner ? (
                <p className="text-xs opacity-45">
                    {map.status === 'draft'
                        ? 'Чернетка — опублікуйте для студентів'
                        : isOwner && map.status === 'published'
                          ? 'Ще ніхто не проходив цю карту'
                          : 'Немає вузлів для відстеження прогресу'}
                </p>
            ) : map.teachingStats.studentsTotal === 0 ? (
                <p className="text-xs opacity-45">Ще ніхто не проходив цю карту</p>
            ) : null}

            <p className="text-[10px] opacity-35">Оновлено {updated}</p>

            <div className="flex flex-wrap gap-2 mt-auto pt-1">
                {canView && (
                    <Link to={`/map/${map.id}`} className="btn btn-outline btn-sm flex-1">
                        {hasStoredNav ? 'Продовжити' : 'Переглянути'}
                    </Link>
                )}
                {canEdit && (
                    <Link to={`/editor/${map.id}`} className="btn btn-primary btn-sm flex-1">
                        Редагувати
                    </Link>
                )}
            </div>
        </div>
    );
}
