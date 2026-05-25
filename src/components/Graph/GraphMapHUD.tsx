import type { GraphViewScope } from './Graph';

interface GraphMapHUDProps {
    viewScope: GraphViewScope;
    groupTitle: string | null;
    activeNodeTitle: string | null;
    onFit: () => void;
    onRecenter: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onBackToGroups?: () => void;
}

export default function GraphMapHUD({
    viewScope,
    groupTitle,
    activeNodeTitle,
    onFit,
    onRecenter,
    onZoomIn,
    onZoomOut,
    onBackToGroups,
}: GraphMapHUDProps) {
    return (
        <>
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-base-content/10 bg-base-100/85 backdrop-blur-sm px-2.5 py-1.5 text-[10px] opacity-70 shadow-sm max-w-[220px]">
                <p>🖱 перетягни — рух</p>
                <p>⚙ колесо — zoom</p>
                {viewScope === 'groups' && (
                    <p className="mt-1 text-primary">Клік по групі — відкрити теми</p>
                )}
                {viewScope === 'topics' && groupTitle && (
                    <p className="mt-1 truncate" title={groupTitle}>
                        📂 {groupTitle}
                    </p>
                )}
                {activeNodeTitle && (
                    <p className="mt-1 text-warning truncate" title={activeNodeTitle}>
                        ★ {activeNodeTitle}
                    </p>
                )}
            </div>

            <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
                {onBackToGroups && (
                    <button
                        type="button"
                        className="btn btn-xs btn-primary shadow-sm"
                        onClick={onBackToGroups}
                        title="Назад до груп"
                    >
                        ← Групи
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-xs btn-square btn-ghost bg-base-100/90 border border-base-content/10 shadow-sm"
                    onClick={onZoomIn}
                    title="Наблизити"
                    aria-label="Наблизити"
                >
                    +
                </button>
                <button
                    type="button"
                    className="btn btn-xs btn-square btn-ghost bg-base-100/90 border border-base-content/10 shadow-sm"
                    onClick={onZoomOut}
                    title="Віддалити"
                    aria-label="Віддалити"
                >
                    −
                </button>
                <button
                    type="button"
                    className="btn btn-xs btn-square btn-ghost bg-base-100/90 border border-base-content/10 shadow-sm"
                    onClick={onRecenter}
                    title="Центрувати"
                    aria-label="Центрувати"
                >
                    ◎
                </button>
                <button
                    type="button"
                    className="btn btn-xs btn-square btn-ghost bg-base-100/90 border border-base-content/10 shadow-sm"
                    onClick={onFit}
                    title="Вмістити"
                    aria-label="Вмістити"
                >
                    ⊞
                </button>
            </div>
        </>
    );
}
