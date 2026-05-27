import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { loginWithGoogle } from '../api';
import { useTheme } from '../context/ThemeContext';

export default function Login() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const [loading, setLoading] = useState(false);

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            await loginWithGoogle();
            navigate('/maps');
        } catch (error) {
            console.error('Помилка входу:', error);
        } finally {
            setLoading(false);
        }
    };

    const meshClass = theme === 'dark' ? 'hero-mesh-dark' : 'hero-mesh-light';

    return (
        <div className={`min-h-[calc(100vh-64px)] flex items-center justify-center ${meshClass} relative`}>
            <div className="absolute inset-0 grid-overlay pointer-events-none" />
            <div className="glass-card p-10 max-w-md w-full mx-4 text-center relative">
                <div className="text-5xl mb-4">🗺️</div>
                <h1 className="text-2xl font-bold mb-2">GraphEdit</h1>
                <p className="opacity-70 mb-8 text-sm">
                    Увійди через Google, щоб зберігати прогрес і відкривати нові теми
                </p>
                <button
                    className="btn btn-primary btn-lg w-full gap-3"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                >
                    {loading ? 'Вхід...' : 'Увійти через Google'}
                </button>
            </div>
        </div>
    );
}
