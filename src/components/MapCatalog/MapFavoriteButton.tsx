import { useState } from 'react';
import type { MapListEngagement } from '../../api/graphEditMaps';

interface MapFavoriteButtonProps {
    mapId: number;
    engagement: MapListEngagement | undefined;
    onToggle?: (mapId: number, favorite: boolean) => Promise<void>;
}

export default function MapFavoriteButton({
    mapId,
    engagement,
    onToggle,
}: MapFavoriteButtonProps) {
    const [busy, setBusy] = useState(false);
    const isFavorite = engagement?.isFavorite ?? false;
    const count = engagement?.favoritesCount ?? 0;

    const handleClick = async () => {
        if (!onToggle || busy) return;
        setBusy(true);
        try {
            await onToggle(mapId, !isFavorite);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            className={`btn btn-ghost btn-xs gap-1 ${isFavorite ? 'text-error' : 'opacity-60'}`}
            disabled={!onToggle || busy}
            title={isFavorite ? 'Прибрати з улюблених' : 'Додати в улюблені'}
            onClick={() => void handleClick()}
        >
            <span className="text-base leading-none">{isFavorite ? '♥' : '♡'}</span>
            <span className="text-[11px]">{count}</span>
        </button>
    );
}
