import { useState } from 'react';
import type { MapListEngagement } from '../../api/graphEditMaps';

interface MapRatingStarsProps {
    mapId: number;
    engagement: MapListEngagement | undefined;
    interactive?: boolean;
    onRate?: (mapId: number, rating: number | null) => Promise<void>;
    size?: 'sm' | 'md';
}

function StarIcon({ filled, half }: { filled: boolean; half?: boolean }) {
    if (half) {
        return (
            <span className="relative inline-block w-[1em]">
                <span className="opacity-30">★</span>
                <span className="absolute inset-0 overflow-hidden w-1/2 text-warning">★</span>
            </span>
        );
    }
    return <span className={filled ? 'text-warning' : 'opacity-30'}>★</span>;
}

export default function MapRatingStars({
    mapId,
    engagement,
    interactive = false,
    onRate,
    size = 'sm',
}: MapRatingStarsProps) {
    const [hover, setHover] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);

    const avg = engagement?.averageRating ?? 0;
    const count = engagement?.ratingsCount ?? 0;
    const myRating = engagement?.myRating ?? null;
    const displayValue = hover ?? myRating ?? Math.round(avg * 2) / 2;
    const textSize = size === 'md' ? 'text-lg' : 'text-sm';

    const handleClick = async (value: number) => {
        if (!interactive || !onRate || busy) return;
        const next = myRating === value ? null : value;
        setBusy(true);
        try {
            await onRate(mapId, next);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div
                className={`${textSize} leading-none select-none ${interactive ? 'cursor-pointer' : ''}`}
                onMouseLeave={() => interactive && setHover(null)}
            >
                {[1, 2, 3, 4, 5].map((star) => {
                    const filled = displayValue >= star;
                    const half = !filled && displayValue >= star - 0.5 && displayValue < star;
                    return (
                        <button
                            key={star}
                            type="button"
                            className={`p-0.5 ${interactive ? 'hover:scale-110 transition-transform' : 'cursor-default'}`}
                            disabled={!interactive || busy}
                            title={interactive ? `Оцінити ${star}` : undefined}
                            onMouseEnter={() => interactive && setHover(star)}
                            onClick={() => void handleClick(star)}
                        >
                            <StarIcon filled={filled} half={half} />
                        </button>
                    );
                })}
            </div>
            <span className="text-[11px] opacity-55">
                {count > 0 ? (
                    <>
                        {avg.toFixed(1)} · {count} {count === 1 ? 'оцінка' : count < 5 ? 'оцінки' : 'оцінок'}
                    </>
                ) : (
                    'Ще без оцінок'
                )}
            </span>
        </div>
    );
}
