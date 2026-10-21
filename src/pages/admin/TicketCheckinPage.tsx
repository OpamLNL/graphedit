import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function TicketCheckinPage() {
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const [eventCode, setEventCode] = useState('');
    const [activeEventCode, setActiveEventCode] = useState<string | null>(null);
    const [manualCode, setManualCode] = useState('');
    const [lastResult, setLastResult] = useState<'ok' | 'reject' | null>(null);
    const [lastMessage, setLastMessage] = useState('');

    useEffect(() => {
        if (!user) return navigate('/');
        if (role !== 'admin') return navigate('/');
    }, [user, role, navigate]);

    const handleEnterEvent = (e: React.FormEvent) => {
        e.preventDefault();
        const code = eventCode.trim();
        if (!code) return;
        // API підключимо пізніше — поки лише UI-сесія
        setActiveEventCode(code);
        setLastResult(null);
        setLastMessage('');
    };

    const handleScanStub = (e: React.FormEvent) => {
        e.preventDefault();
        const code = manualCode.trim();
        if (!code || !activeEventCode) return;
        setLastResult('ok');
        setLastMessage(`Отримано код «${code}» (скан ще без API)`);
        setManualCode('');
    };

    if (role !== 'admin') {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    return (
        <div className="max-w-xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold">Перевірка квитків</h1>
                <Link to="/admin/adminPage" className="btn btn-ghost btn-sm">
                    ← Адмінка
                </Link>
            </div>

            {!activeEventCode ? (
                <form onSubmit={handleEnterEvent} className="space-y-4">
                    <p className="text-sm opacity-70">
                        Введіть код концерту, щоб відкрити сканер штрихкодів.
                    </p>
                    <input
                        className="input input-bordered w-full"
                        placeholder="Код концерту"
                        value={eventCode}
                        onChange={(e) => setEventCode(e.target.value)}
                        autoFocus
                    />
                    <button type="submit" className="btn btn-primary w-full">
                        Увійти
                    </button>
                </form>
            ) : (
                <div className="space-y-6">
                    <div className="rounded-xl border border-base-content/10 p-4">
                        <div className="text-xs opacity-60">Концерт</div>
                        <div className="font-mono text-lg font-semibold">{activeEventCode}</div>
                        <button
                            type="button"
                            className="btn btn-ghost btn-xs mt-2"
                            onClick={() => {
                                setActiveEventCode(null);
                                setEventCode('');
                            }}
                        >
                            Змінити концерт
                        </button>
                    </div>

                    <div className="rounded-xl border border-dashed border-base-content/20 p-8 text-center opacity-60">
                        Тут буде камера / сканер QR
                    </div>

                    <form onSubmit={handleScanStub} className="space-y-3">
                        <label className="text-sm opacity-70">Або введіть код вручну</label>
                        <input
                            className="input input-bordered w-full font-mono"
                            placeholder="Штрихкод / QR"
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary w-full">
                            Перевірити
                        </button>
                    </form>

                    {lastResult && (
                        <div
                            className={`rounded-xl p-4 text-center font-semibold ${
                                lastResult === 'ok'
                                    ? 'bg-success/20 text-success'
                                    : 'bg-error/20 text-error'
                            }`}
                        >
                            {lastMessage}
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">—</div>
                            <div className="text-xs opacity-60">Всього</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">—</div>
                            <div className="text-xs opacity-60">Пройшли</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">—</div>
                            <div className="text-xs opacity-60">Залишилось</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
