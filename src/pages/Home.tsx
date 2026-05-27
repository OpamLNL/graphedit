import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { loginWithGoogle } from '../api';
import HeroGraph from '../components/Graph/HeroGraph';
const PROMO_STATS = [
    { value: '532+', label: 'вузлів у графі', sub: 'програмовані теми' },
    { value: '996+', label: 'зв\'язків', sub: 'DAG-структура' },
    { value: '521', label: 'тем контенту', sub: 'з описами' },
    { value: '∞', label: 'версій', sub: 'історія змін' },
];

const EDITOR_FEATURES = [
    {
        icon: '✏️',
        title: 'Візуальний редактор',
        desc: 'Drag-and-drop вузлів, проведення ребер, зміна кольорів і позицій на canvas.',
    },
    {
        icon: '🔍',
        title: 'Валідація DAG',
        desc: 'Автоматична перевірка циклів, дублікатів і ізольованих вузлів перед публікацією.',
    },
    {
        icon: '📦',
        title: 'Bulk save',
        desc: 'Збереження всього графа одним запитом — nodes, edges, видалення.',
    },
    {
        icon: '🕐',
        title: 'Версіонування',
        desc: 'Snapshots, відкат до попередніх версій, auto-backup перед publish.',
    },
    {
        icon: '🚀',
        title: 'Draft → Publish',
        desc: 'Редагуй чернетку, перевіряй валідацію, публікуй для студентів.',
    },
    {
        icon: '📊',
        title: 'Аналітика',
        desc: 'Прогрес студентів, % завершення, dashboard для адміністратора.',
    },
];

const STEPS = [
    { num: '01', title: 'Створи карту', text: 'Нова чернетка з темами та вузлами' },
    { num: '02', title: 'Побудуй граф', text: 'З\'єднай теми ребрами-prerequisite' },
    { num: '03', title: 'Опублікуй', text: 'Студенти отримують інтерактивну карту' },
];

export default function Home() {
    const { user, role, profileName } = useAuth();
    const { theme } = useTheme();
    const [loginLoading, setLoginLoading] = useState(false);

    const landingClass = theme === 'dark' ? 'landing-dark' : 'landing-light';

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

    return (
        <div className={`${landingClass} relative overflow-hidden`}>
            <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

            {/* ── Hero ── */}
            <section className="relative max-w-7xl mx-auto px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                    <div className="animate-slide-up">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-xs font-semibold text-primary mb-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            Редактор графових карт знань
                        </div>

                        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
                            Створюй та{' '}
                            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                                редагуй
                            </span>
                            <br />
                            карти знань
                        </h1>

                        <p className="text-lg opacity-70 mb-8 max-w-lg leading-relaxed">
                            GraphEdit — вебзастосунок для побудови навчальних DAG-графів.
                            Візуальний редактор, валідація структури, версіонування та публікація для студентів.
                        </p>

                        <div className="flex flex-wrap gap-3">
                            {user ? (
                                <Link to="/maps" className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25">
                                    🗺️ Карти
                                </Link>
                            ) : (
                                <button
                                    className="btn btn-primary btn-lg gap-2 shadow-lg shadow-primary/25"
                                    onClick={handleGoogleLogin}
                                    disabled={loginLoading}
                                >
                                    {loginLoading ? 'Вхід...' : 'Почати з Google →'}
                                </button>
                            )}
                            <Link to="/topics" className="btn btn-outline btn-lg">
                                Переглянути теми
                            </Link>
                        </div>

                        {user && (
                            <p className="mt-4 text-sm opacity-50">
                                Увійшов як <span className="font-semibold capitalize">{role}</span>
                                {' · '}{profileName ?? user.displayName ?? 'користувач'}
                            </p>
                        )}
                    </div>

                    <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
                        <div className="relative w-full max-w-lg mx-auto glass-card p-3 overflow-hidden">
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-xs font-semibold opacity-60">Редактор · Карта #1</span>
                                <div className="flex gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-error/60" />
                                    <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                                    <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
                                </div>
                            </div>
                            <HeroGraph />
                            <div className="flex gap-2 mt-2 px-1">
                                <span className="badge badge-primary badge-sm">draft</span>
                                <span className="badge badge-ghost badge-sm opacity-60">7 nodes · 7 edges</span>
                                <span className="badge badge-ghost badge-sm opacity-40 ml-auto">React Flow</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Promo stats ── */}
            <section className="relative border-y border-base-content/5 bg-base-100/40 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-6 py-14">
                    <p className="text-center text-sm uppercase tracking-widest opacity-40 mb-8 font-display font-semibold">
                        Платформа в цифрах
                    </p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                        {PROMO_STATS.map((s) => (
                            <div key={s.label} className="stat-card">
                                <div className="stat-value">{s.value}</div>
                                <div className="font-semibold mt-2 text-sm">{s.label}</div>
                                <div className="text-xs opacity-45 mt-0.5">{s.sub}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28">
                <div className="text-center mb-14">
                    <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                        Можливості редактора
                    </h2>
                    <p className="opacity-60 max-w-xl mx-auto">
                        Все необхідне для створення структурованих навчальних траєкторій на базі графів
                    </p>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {EDITOR_FEATURES.map((f) => (
                        <div
                            key={f.title}
                            className="glass-card p-6 hover:border-primary/30 transition-colors group"
                        >
                            <div className="text-3xl mb-4 group-hover:scale-110 transition-transform inline-block">
                                {f.icon}
                            </div>
                            <h3 className="font-display font-bold text-lg mb-2">{f.title}</h3>
                            <p className="text-sm opacity-65 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── How it works ── */}
            <section className="relative bg-base-200/50 border-y border-base-content/5">
                <div className="max-w-7xl mx-auto px-6 py-20">
                    <h2 className="font-display text-3xl font-bold text-center mb-12">Як це працює</h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        {STEPS.map((step, i) => (
                            <div key={step.num} className="relative text-center md:text-left">
                                {i < STEPS.length - 1 && (
                                    <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/40 to-transparent" />
                                )}
                                <div className="font-display text-5xl font-extrabold text-primary/20 mb-3">
                                    {step.num}
                                </div>
                                <h3 className="font-display font-bold text-xl mb-2">{step.title}</h3>
                                <p className="text-sm opacity-60">{step.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="relative max-w-7xl mx-auto px-6 py-20 text-center">
                <div className="glass-card p-10 md:p-14 max-w-3xl mx-auto">
                    <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                        Готовий будувати карту знань?
                    </h2>
                    <p className="opacity-60 mb-8 max-w-md mx-auto">
                        Приєднуйся через Google — викладачі отримують доступ до редактора,
                        студенти — до інтерактивної карти з прогресом.
                    </p>
                    {!user ? (
                        <button
                            className="btn btn-primary btn-lg gap-2"
                            onClick={handleGoogleLogin}
                            disabled={loginLoading}
                        >
                            Увійти через Google
                        </button>
                    ) : (
                        <Link to="/maps" className="btn btn-primary btn-lg">
                            До каталогу карт →
                        </Link>
                    )}
                </div>
            </section>

            <footer className="border-t border-base-content/5 py-8 text-center text-xs opacity-40">
                GraphEdit · Дипломний проєкт · Редактор карт знань на базі графових структур
            </footer>
        </div>
    );
}
