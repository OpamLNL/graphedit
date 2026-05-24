import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { progressApi, type ProgressSummary } from '../api/progress';
import { useAuth } from '../context/AuthContext';

export default function ProgressPage() {
    const { user, loading: authLoading } = useAuth();
    const [summary, setSummary] = useState<ProgressSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        progressApi
            .getMySummary()
            .then(setSummary)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user]);

    if (authLoading || loading) {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    if (!user) {
        return (
            <div className="max-w-lg mx-auto p-8 text-center">
                <p className="mb-4">Увійди, щоб переглянути прогрес</p>
                <Link to="/login" className="btn btn-primary">Увійти</Link>
            </div>
        );
    }

    if (!summary) return null;

    return (
        <div className="max-w-3xl mx-auto p-6 md:p-10">
            <h1 className="text-3xl font-bold mb-8">Твій прогрес</h1>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Вивчено', value: summary.completed, color: 'text-success' },
                    { label: 'Доступно', value: summary.available, color: 'text-primary' },
                    { label: 'Заблоковано', value: summary.locked, color: 'opacity-50' },
                    { label: 'Всього', value: summary.total, color: '' },
                ].map((s) => (
                    <div key={s.label} className="glass-card p-4 text-center">
                        <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-sm opacity-60 mt-1">{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                    <span>Загальний прогрес</span>
                    <span className="font-bold text-primary">{summary.percent}%</span>
                </div>
                <progress className="progress progress-primary w-full" value={summary.percent} max={100} />
            </div>

            <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                {summary.nodes
                    .filter((n) => n.status !== 'locked')
                    .map((node) => (
                        <li
                            key={node.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border border-base-content/10 ${
                                node.status === 'completed' ? 'bg-success/10' : 'bg-primary/5'
                            }`}
                        >
                            <span>{node.status === 'completed' ? '✅' : '🔓'}</span>
                            <span className="text-sm">{node.title}</span>
                        </li>
                    ))}
            </ul>

            <Link to="/maps" className="btn btn-primary mt-8 w-full">
                Продовжити навчання →
            </Link>
        </div>
    );
}
