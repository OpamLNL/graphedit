import { Link } from 'react-router-dom';
import type { GraphEditMap } from '../../api/graphEditMaps';
import MapGraphValidationBadge from '../MapGraphValidationBadge';
import type { ProgressSummary } from '../../api/progress';
import type { GraphViewScope } from '../Graph/Graph';
import type { GroupData, NodeData } from '../Graph/Graph';

interface MapPageHeaderProps {
    mapMeta: GraphEditMap | null;
    mapId: number;
    groups: GroupData[];
    nodes: NodeData[];
    viewScope: GraphViewScope;
    selectedGroupId: string | null;
    selectedGroupTitle: string | null;
    progress: ProgressSummary | null;
    searchQuery: string;
    searchResults: NodeData[];
    isEditor: boolean;
    onBackToGroups: () => void;
    onSelectGroup: (groupId: string) => void;
    onSearchChange: (q: string) => void;
    onSearchPick: (node: NodeData) => void;
}

export default function MapPageHeader({
    mapMeta,
    mapId,
    groups,
    nodes,
    viewScope,
    selectedGroupId,
    selectedGroupTitle,
    progress,
    searchQuery,
    searchResults,
    isEditor,
    onBackToGroups,
    onSelectGroup,
    onSearchChange,
    onSearchPick,
}: MapPageHeaderProps) {
    const completedNodes = progress?.completed ?? nodes.filter((n) => n.status === 'completed').length;
    const availableNodes = progress?.available ?? nodes.filter((n) => n.status === 'available').length;
    const totalNodes = progress?.total ?? nodes.length;
    const percent = progress?.percent ?? (totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0);

    return (
        <header className="shrink-0 border-b border-base-content/10 bg-base-100/80 backdrop-blur-sm">
            <div className="px-4 py-4 space-y-3 max-w-[1600px] mx-auto">
                <div className="flex flex-wrap items-start gap-3">
                    <Link to="/maps" className="btn btn-ghost btn-xs mt-0.5">
                        ← Карти
                    </Link>

                    <div className="flex-1 min-w-[200px]">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="font-display text-xl sm:text-2xl font-bold leading-tight">
                                {mapMeta?.title ?? 'Карта знань'}
                            </h1>
                            {mapMeta?.status === 'draft' && (
                                <span className="badge badge-warning badge-sm">чернетка</span>
                            )}
                            <MapGraphValidationBadge map={mapMeta} />
                        </div>
                        {mapMeta?.description && (
                            <p className="text-sm opacity-65 mt-1 max-w-2xl leading-relaxed">
                                {mapMeta.description}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 ml-auto">
                        <div className="relative">
                            <input
                                type="search"
                                placeholder="Пошук теми..."
                                className="input input-sm input-bordered w-40 sm:w-52"
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                            {searchQuery && searchResults.length > 0 && (
                                <ul className="absolute top-full right-0 mt-1 z-40 menu bg-base-100 rounded-box shadow-lg border border-base-content/10 w-72 p-1 max-h-64 overflow-y-auto">
                                    {searchResults.map((n) => {
                                        const g = groups.find((gr) => gr.id === n.groupId);
                                        return (
                                            <li key={n.id}>
                                                <button type="button" onClick={() => onSearchPick(n)}>
                                                    <span className="truncate">{n.title}</span>
                                                    <span className="badge badge-xs opacity-50 shrink-0">
                                                        {g?.title?.slice(0, 14) ?? '?'}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => window.__fitGraphView?.()}
                        >
                            ⊞ Fit
                        </button>

                        {isEditor && (
                            <Link to={`/editor/${mapId}`} className="btn btn-outline btn-sm">
                                Редагувати
                            </Link>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className="badge badge-ghost">{groups.length} груп</span>
                        <span className="badge badge-ghost">{totalNodes} тем</span>
                        <span className="badge badge-success badge-outline">{completedNodes} вивчено</span>
                        <span className="badge badge-primary badge-outline">{availableNodes} доступно</span>
                    </div>

                    <div className="flex-1 min-w-[140px] max-w-md">
                        <div className="flex justify-between text-[11px] opacity-70 mb-1">
                            <span>Прогрес карти</span>
                            <span className="font-semibold text-primary">{percent}%</span>
                        </div>
                        <progress className="progress progress-primary w-full h-2" value={percent} max={100} />
                    </div>

                    <div className="flex items-center gap-1 text-xs">
                        <button
                            type="button"
                            className={`btn btn-xs ${viewScope === 'groups' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={onBackToGroups}
                        >
                            Групи
                        </button>
                        {viewScope === 'topics' && selectedGroupTitle && (
                            <>
                                <span className="opacity-40">/</span>
                                <span className="font-medium truncate max-w-[180px]" title={selectedGroupTitle}>
                                    {selectedGroupTitle}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
                    {groups.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            title={`${g.completedCount}/${g.topicCount} вивчено · ${g.progressPercent}%`}
                            className={`btn btn-xs shrink-0 ${
                                selectedGroupId === g.id && viewScope === 'topics'
                                    ? 'btn-secondary'
                                    : g.availableCount > 0
                                      ? 'btn-ghost border border-success/30'
                                      : 'btn-ghost'
                            }`}
                            onClick={() => onSelectGroup(g.id)}
                        >
                            {g.title}
                            <span className="opacity-45 ml-1">{g.progressPercent}%</span>
                        </button>
                    ))}
                </div>
            </div>
        </header>
    );
}
