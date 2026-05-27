import { Link } from 'react-router-dom';
import type { LearnerProgressStatus } from '../../api/users';

export const ROLE_LABELS: Record<string, string> = {
    admin: 'Адмін',
    teacher: 'Викладач',
    student: 'Студент',
    guest: 'Гість',
};

export const STATUS_LABELS: Record<LearnerProgressStatus, string> = {
    not_started: 'Не розпочато',
    in_progress: 'В процесі',
    completed: 'Завершено',
};

export function statusBadgeClass(status: LearnerProgressStatus): string {
    if (status === 'completed') return 'badge-success';
    if (status === 'in_progress') return 'badge-primary';
    return 'badge-ghost';
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('uk-UA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

interface ProgressBarProps {
    percent: number;
    completed: number;
    total: number;
    compact?: boolean;
}

export function ProgressBar({ percent, completed, total, compact }: ProgressBarProps) {
    return (
        <div className={compact ? 'min-w-[120px]' : ''}>
            <div className="flex justify-between text-xs mb-1 gap-2">
                <span className="opacity-60 whitespace-nowrap">
                    {completed}/{total}
                </span>
                <span className="font-semibold text-primary">{percent}%</span>
            </div>
            <progress
                className={`progress progress-primary w-full ${compact ? 'h-1.5' : 'h-2'}`}
                value={percent}
                max={100}
            />
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: string | number;
    accent?: boolean;
}

export function StatCard({ label, value, accent }: StatCardProps) {
    return (
        <div className="glass-card p-4 text-center">
            <div className={`text-2xl md:text-3xl font-bold ${accent ? 'text-primary' : ''}`}>
                {value}
            </div>
            <div className="text-xs opacity-55 mt-1">{label}</div>
        </div>
    );
}

interface TeachingNavProps {
    active: 'stats' | 'users' | 'map';
}

export function TeachingNav({ active }: TeachingNavProps) {
    const linkClass = (key: TeachingNavProps['active']) =>
        `btn btn-sm ${active === key ? 'btn-primary' : 'btn-ghost'}`;

    return (
        <div className="flex flex-wrap gap-2 mb-6">
            <Link to="/teaching" className={linkClass('stats')}>
                Статистика карт
            </Link>
            <Link to="/teaching/users" className={linkClass('users')}>
                Учні
            </Link>
        </div>
    );
}
