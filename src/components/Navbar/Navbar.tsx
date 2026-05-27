import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { loginWithGoogle, logoutUser } from '../../api';

type NavLink = {
    path: string;
    label: string;
    authOnly?: boolean;
    adminOnly?: boolean;
    editorOnly?: boolean;
};

export const navLinks: NavLink[] = [
    { path: '/', label: 'Головна' },
    { path: '/maps', label: 'Карти', authOnly: true },
    { path: '/topics', label: 'Теми' },
    { path: '/profile', label: 'Кабінет', authOnly: true },
    { path: '/admin/adminPage', label: 'Адмін', adminOnly: true },
];

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const { user, role, avatarUrl, profileName } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();

    const isLoggedIn = !!user;
    const isAdmin = role === 'admin';
    const isEditor = role === 'admin' || role === 'teacher';

    const filteredLinks = navLinks.filter((link) => {
        if (link.adminOnly) return isAdmin;
        if (link.editorOnly) return isEditor;
        if (link.authOnly) return isLoggedIn;
        return true;
    });

    const handleGoogleLogin = async () => {
        setLoginLoading(true);
        try {
            await loginWithGoogle();
            window.location.reload();
        } catch (err) {
            console.error('Помилка входу:', err);
        } finally {
            setLoginLoading(false);
        }
    };

    const handleLogout = async () => {
        await logoutUser();
        navigate('/');
    };

    return (
        <header className="sticky top-0 z-50 bg-base-100/70 backdrop-blur-xl border-b border-base-content/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
                <div className="flex items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-content font-display font-bold text-sm shadow-lg shadow-primary/25 group-hover:scale-105 transition-transform">
                            G
                        </div>
                        <div className="hidden sm:block">
                            <span className="font-display font-bold text-base leading-none">GraphEdit</span>
                            <span className="block text-[10px] opacity-50 tracking-widest uppercase">Карти знань</span>
                        </div>
                    </Link>

                    <nav className="hidden lg:flex items-center gap-0.5">
                        {filteredLinks.map(({ path, label }) => {
                            const active = location.pathname === path;
                            return (
                                <Link
                                    key={path}
                                    to={path}
                                    className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                                        active
                                            ? 'bg-primary/15 text-primary'
                                            : 'hover:bg-base-200/80 opacity-80 hover:opacity-100'
                                    }`}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-1.5">
                        <button
                            className="btn btn-ghost btn-sm btn-circle opacity-70 hover:opacity-100"
                            onClick={toggleTheme}
                            aria-label="Змінити тему"
                        >
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>

                        {user ? (
                            <>
                                <Link to="/my-maps" className="btn btn-primary btn-sm hidden sm:flex gap-1">
                                    🗺️ Мої карти
                                </Link>
                                <Link to="/profile" className="hidden md:flex items-center gap-2 pl-1 hover:opacity-90 transition-opacity">
                                    {(avatarUrl ?? user.photoURL) && (
                                        <img
                                            src={avatarUrl ?? user.photoURL ?? ''}
                                            alt=""
                                            className="w-8 h-8 rounded-full ring-2 ring-primary/30 object-cover"
                                        />
                                    )}
                                    <div className="text-right leading-tight">
                                        <p className="text-xs font-semibold truncate max-w-[100px]">
                                            {(profileName ?? user.displayName)?.split(' ')[0] ?? 'Профіль'}
                                        </p>
                                        <p className="text-[10px] opacity-45 capitalize">{role}</p>
                                    </div>
                                </Link>
                                <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                                    Вийти
                                </button>
                            </>
                        ) : (
                            <button
                                className="btn btn-primary btn-sm gap-2"
                                onClick={handleGoogleLogin}
                                disabled={loginLoading}
                            >
                                <GoogleIcon />
                                {loginLoading ? '...' : 'Увійти'}
                            </button>
                        )}

                        <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setIsOpen(!isOpen)}>
                            ☰
                        </button>
                    </div>
                </div>

                {isOpen && (
                    <nav className="lg:hidden flex flex-col gap-0.5 pt-3 pb-1 border-t border-base-content/5 mt-3">
                        {filteredLinks.map(({ path, label }) => (
                            <Link
                                key={path}
                                to={path}
                                onClick={() => setIsOpen(false)}
                                className="px-3 py-2.5 rounded-lg hover:bg-base-200/80 font-medium"
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>
                )}
            </div>
        </header>
    );
}

function GoogleIcon() {
    return (
        <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
    );
}
