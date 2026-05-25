import type { GroupData } from '../Graph/Graph';

interface MapGroupsOverviewProps {
    groups: GroupData[];
    onSelectGroup: (groupId: string) => void;
}

export default function MapGroupsOverview({ groups, onSelectGroup }: MapGroupsOverviewProps) {
    if (groups.length === 0) {
        return (
            <div className="shrink-0 border-b border-base-content/10 p-6 text-center">
                <p className="opacity-60 text-sm">У цій карті ще немає груп знань.</p>
            </div>
        );
    }

    return (
        <div className="shrink-0 border-b border-base-content/10 bg-base-100/60 p-4 sm:p-5 max-h-[min(42vh,320px)] overflow-y-auto">
            <div className="max-w-5xl mx-auto">
                <h2 className="font-display text-base font-semibold mb-1">Групи знань</h2>
                <p className="text-xs opacity-55 mb-4">
                    Обери групу нижче або на графі — відкриється карта тем.
                </p>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {groups.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            className="glass-card p-4 text-left hover:border-primary/35 transition-colors flex flex-col gap-2"
                            onClick={() => onSelectGroup(g.id)}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <span className="font-display font-semibold text-sm leading-snug">
                                    {g.title}
                                </span>
                                <span className="badge badge-sm badge-ghost shrink-0">
                                    {g.topicCount} тем
                                </span>
                            </div>
                            {g.description && (
                                <p className="text-xs opacity-55 line-clamp-2">{g.description}</p>
                            )}
                            <div className="mt-auto pt-2 space-y-1.5">
                                <div className="flex justify-between text-[10px] opacity-60">
                                    <span>{g.completedCount} вивчено</span>
                                    <span>{g.progressPercent}%</span>
                                </div>
                                <progress
                                    className="progress progress-primary w-full h-1.5"
                                    value={g.progressPercent}
                                    max={100}
                                />
                                {g.availableCount > 0 && (
                                    <p className="text-[10px] text-success">
                                        {g.availableCount} доступно зараз
                                    </p>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
