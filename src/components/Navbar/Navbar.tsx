import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { loginWithGoogle, logoutUser } from '../../api';

export const navLinks = [
    { path: '/', label: 'Головна' },
    { path: '/topics', label: 'Теми' },
    { path: '/map', label: 'Карта', authOnly: true },
    { path: '/progress', label: 'Прогрес', authOnly: true },
    { path: '/admin/adminPage', label: 'Адмін', adminOnly: true },
];

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const { user, role } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();

    const isLoggedIn = !!user;
    const isAdmin = role === 'admin';

    const filteredLinks = navLinks.filter((link) => {
        if (link.adminOnly) return isAdmin;
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
        <header className="sticky top-0 z-50 bg-base-100/80 backdrop-blur-md border-b border-base-content/10 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-3 shrink-0">
                        <img src="/logo.png" className="h-8 w-8" alt="logo" />
                        <span className="font-bold text-primary hidden sm:block">Knowledge Map</span>
                    </Link>

                    <nav className="hidden md:flex gap-1">
                        {filteredLinks.map(({ path, label }) => (
                            <Link
                                key={path}
                                to={path}
                                className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-base-200 transition-colors"
                            >
                                {label}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        <button
                            className="btn btn-ghost btn-sm btn-circle"
                            onClick={toggleTheme}
                            aria-label="Змінити тему"
                            title={theme === 'dark' ? 'Світла тема' : 'Темна тема'}
                        >
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>

                        {user ? (
                            <div className="flex items-center gap-2">
                                <div className="hidden sm:block text-right">
                                    <p className="text-xs font-medium truncate max-w-[120px]">
                                        {user.displayName?.split(' ')[0] || user.email}
                                    </p>
                                    <p className="text-xs opacity-50">{role}</p>
                                </div>
                                {user.photoURL && (
                                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                                )}
                                <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                                    Вийти
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-primary btn-sm gap-2"
                                onClick={handleGoogleLogin}
                                disabled={loginLoading}
                            >
                                {loginLoading ? '...' : 'Google'}
                            </button>
                        )}

                        <button
                            className="btn btn-ghost btn-sm md:hidden"
                            onClick={() => setIsOpen(!isOpen)}
                        >
                            ☰
                        </button>
                    </div>
                </div>

                {isOpen && (
                    <nav className="md:hidden flex flex-col gap-1 pt-3 pb-1">
                        {filteredLinks.map(({ path, label }) => (
                            <Link
                                key={path}
                                to={path}
                                onClick={() => setIsOpen(false)}
                                className="px-3 py-2 rounded-lg hover:bg-base-200"
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
