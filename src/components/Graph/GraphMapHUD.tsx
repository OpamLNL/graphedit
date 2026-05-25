interface GraphMapHUDProps {
    selectedLevel: number | null;
    levelRange: number[];
    activeNodeTitle: string | null;
    showDirectionHint?: boolean;
    onFit: () => void;
    onRecenter: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
}

export default function GraphMapHUD({
    selectedLevel,
    levelRange,
    activeNodeTitle,
    showDirectionHint = true,
    onFit,
    onRecenter,
    onZoomIn,
    onZoomOut,
}: GraphMapHUDProps) {
    const minLevel = levelRange[0] ?? 0;
    const maxLevel = levelRange[levelRange.length - 1] ?? 0;

    return (
        <>
            {/* Вісь рівнів */}
            {showDirectionHint && levelRange.length > 0 && (
                <div className="pointer-events-none absolute top-3 left-3 right-3 z-10 flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-lg border border-base-content/10 bg-base-100/90 backdrop-blur-sm px-3 py-1.5 text-[11px] shadow-sm">
                        <span className="opacity-50 shrink-0">← базові</span>
                        <div className="flex-1 relative h-4 flex items-center">
                            <div className="absolute inset-x-0 top-1/2 h-px bg-primary/30" />
                            <div className="absolute left-0 top-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-[6px] border-r-primary/50 -translate-y-1/2" />
                            <div className="absolute right-0 top-1/2 w-0 h-0 border-y-4 border-y-transparent border-l-[6px] border-l-primary/50 -translate-y-1/2" />
                            {levelRange.map((lv) => {
                                const pct =
                                    maxLevel === minLevel
                                        ? 50
                                        : ((lv - minLevel) / (maxLevel - minLevel)) * 100;
                                const isActive = selectedLevel === lv;
                                return (
                                    <span
                                        key={lv}
                                        className={`absolute -translate-x-1/2 text-[9px] font-semibold px-1 rounded ${
                                            isActive
                                                ? 'bg-primary text-primary-content -top-0.5'
                                                : 'opacity-40 top-0'
                                        }`}
                                        style={{ left: `${pct}%` }}
                                    >
                                        L{lv}
                                    </span>
                                );
                            })}
                        </div>
                        <span className="opacity-50 shrink-0">просунуті →</span>
                    </div>
                </div>
            )}

            {/* Центральний маркер (орієнтир viewport) */}
            <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center">
                    <div className="w-px h-3 bg-primary/30 absolute" />
                    <div className="h-px w-3 bg-primary/30 absolute" />
                </div>
            </div>

            {/* Підказка навігації */}
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-base-content/10 bg-base-100/85 backdrop-blur-sm px-2.5 py-1.5 text-[10px] opacity-70 shadow-sm max-w-[200px]">
                <p>🖱 перетягни — рух карти</p>
                <p>⚙ колесо — наблизити / віддалити</p>
                {activeNodeTitle && (
                    <p className="mt-1 text-warning truncate" title={activeNodeTitle}>
                        ◎ {activeNodeTitle}
                    </p>
                )}
            </div>

            {/* Кнопки керування */}
            <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
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
                    title="Центрувати обраний вузол"
                    aria-label="Центрувати"
                >
                    ◎
                </button>
                <button
                    type="button"
                    className="btn btn-xs btn-square btn-ghost bg-base-100/90 border border-base-content/10 shadow-sm"
                    onClick={onFit}
                    title="Показати весь рівень"
                    aria-label="Вмістити"
                >
                    ⊞
                </button>
            </div>
        </>
    );
}
