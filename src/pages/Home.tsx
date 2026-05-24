import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { loginWithGoogle } from '../api';
import { progressApi, type ProgressSummary } from '../api/progress';

const features = [
    {
        icon: '🗺️',
        title: 'Графова карта',
        text: 'Візуалізуй зв\'язки між темами — від основ до просунутих концепцій.',
    },
    {
        icon: '📈',
        title: 'Прогрес навчання',
        text: 'Відстежуй вивчені теми, відкривай нові вузли крок за кроком.',
    },
    {
        icon: '✏️',
        title: 'Редагування',
        text: 'Викладачі та адміни можуть будувати та оновлювати карту знань.',
    },
];

function ProgressRing({ percent }: { percent: number }) {
    const r = 54;
    const c = 2 * Math.PI * r;
    const offset = c - (percent / 100) * c;

    return (
        <div className="relative w-36 h-36">
            <svg className="w-full h-full progress-ring" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="10" />
                <circle
                    cx="60" cy="60" r={r} fill="none"
                    stroke="oklch(var(--p))"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    className="transition-all duration-700"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-primary">{percent}%</span>
                <span className="text-xs opacity-60">вивчено</span>
            </div>
        </div>
    );
}

export default function Home() {
    const { user, role, loading } = useAuth();
    const { theme } = useTheme();
    const [summary, setSummary] = useState<ProgressSummary | null>(null);
    const [loginLoading, setLoginLoading] = useState(false);

    useEffect(() => {
        if (!user) return;
        progressApi.getMySummary().then(setSummary).catch(() => setSummary(null));
    }, [user]);

    const handleGoogleLogin = async () => {
        setLoginLoading(true);
        try {
            await loginWithGoogle();
            window.location.reload();
        } catch (e) {
            console.error(e);
        } finally {
            setLoginLoading(false);
        }
    };

    const meshClass = theme === 'dark' ? 'hero-mesh-dark' : 'hero-mesh-light';

    return (
        <div className={`relative overflow-hidden ${meshClass}`}>
            <div className="absolute inset-0 grid-overlay pointer-events-none" />

            {/* Hero */}
            <section className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card text-sm mb-8 animate-float">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    Knowledge Map · Програмування
                </div>

                <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                    Інтерактивна карта знань
                </h1>

                <p className="text-lg md:text-xl max-w-2xl mx-auto opacity-80 mb-10 leading-relaxed">
                    Твій провідник у світ алгоритмів, структур даних та мов програмування.
                    Рухайся по графу тем, відстежуй прогрес і відкривай нові горizontи.
                </p>

                <div className="flex flex-wrap gap-4 justify-center">
                    {user ? (
                        <>
                            <Link to="/map" className="btn btn-primary btn-lg gap-2">
                                🗺️ Відкрити карту
                            </Link>
                            <Link to="/progress" className="btn btn-outline btn-lg">
                                📊 Мій прогрес
                            </Link>
                        </>
                    ) : (
                        <button
                            className="btn btn-primary btn-lg gap-3"
                            onClick={handleGoogleLogin}
                            disabled={loginLoading}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            {loginLoading ? 'Вхід...' : 'Увійти через Google'}
                        </button>
                    )}
                    <Link to="/topics" className="btn btn-ghost btn-lg">
                        Переглянути теми
                    </Link>
                </div>

                {user && summary && (
                    <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-8">
                        <ProgressRing percent={summary.percent} />
                        <div className="text-left space-y-2">
                            <p className="text-sm opacity-60">Привіт, {user.displayName?.split(' ')[0]}!</p>
                            <p className="text-2xl font-semibold">
                                {summary.completed} / {summary.total} тем
                            </p>
                            <div className="flex gap-4 text-sm">
                                <span className="text-success">✅ {summary.completed} вивчено</span>
                                <span className="text-primary">🔓 {summary.available} доступно</span>
                                <span className="opacity-50">🔒 {summary.locked} заблоковано</span>
                            </div>
                            {role && (
                                <span className="badge badge-outline badge-sm mt-1">{role}</span>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Features */}
            <section className="relative max-w-6xl mx-auto px-6 pb-20">
                <div className="grid md:grid-cols-3 gap-6">
                    {features.map((f) => (
                        <div key={f.title} className="glass-card p-6 hover:scale-[1.02] transition-transform">
                            <div className="text-4xl mb-4">{f.icon}</div>
                            <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                            <p className="text-sm opacity-70 leading-relaxed">{f.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA strip */}
            <section className="relative border-t border-base-content/10 bg-base-100/50 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h2 className="text-2xl font-bold">Готовий почати?</h2>
                        <p className="opacity-70 mt-1">500+ тем з програмування в одному графі.</p>
                    </div>
                    {!loading && !user && (
                        <button className="btn btn-accent" onClick={handleGoogleLogin} disabled={loginLoading}>
                            Почати безкоштовно
                        </button>
                    )}
                    {user && (
                        <Link to="/map" className="btn btn-accent">
                            Перейти до карти →
                        </Link>
                    )}
                </div>
            </section>
        </div>
    );
}
