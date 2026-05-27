import { Link } from 'react-router-dom';
import type { GraphEditMap } from '../../api/graphEditMaps';
import MapGraphValidationBadge from '../MapGraphValidationBadge';
import MapCardMeta from '../MapCard/MapCardMeta';
import MapRatingStars from './MapRatingStars';
import MapFavoriteButton from './MapFavoriteButton';

interface MapCatalogCardProps {
    map: GraphEditMap;
    currentUserUid: string;
    showEngagement?: boolean;
    onFavorite?: (mapId: number, favorite: boolean) => Promise<void>;
    onRate?: (mapId: number, rating: number | null) => Promise<void>;
    footer?: React.ReactNode;
}

export default function MapCatalogCard({
    map,
    currentUserUid,
    showEngagement = true,
    onFavorite,
    onRate,
    footer,
}: MapCatalogCardProps) {
    const updated = new Date(map.updatedAt).toLocaleDateString('uk-UA');
    const canEngage = map.status === 'published' && showEngagement;

    return (
        <div className="glass-card p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between gap-2">
                <h2 className="font-display font-bold text-base leading-snug">{map.title}</h2>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                        className={`badge badge-sm ${
                            map.status === 'published' ? 'badge-success' : 'badge-warning'
                        }`}
                    >
                        {map.status === 'published' ? 'published' : 'draft'}
                    </span>
                    <MapGraphValidationBadge map={map} />
                </div>
            </div>

            {map.description && (
                <p className="text-xs opacity-55 line-clamp-2">{map.description}</p>
            )}

            {canEngage && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <MapRatingStars
                        mapId={map.id}
                        engagement={map.engagement}
                        interactive={!!onRate}
                        onRate={onRate}
                    />
                    <MapFavoriteButton
                        mapId={map.id}
                        engagement={map.engagement}
                        onToggle={onFavorite}
                    />
                </div>
            )}

            <MapCardMeta map={map} currentUserUid={currentUserUid} />

            <p className="text-[10px] opacity-40">Оновлено {updated}</p>

            {footer ?? (
                <div className="flex gap-2 mt-auto pt-2">
                    <Link
                        to={map.status === 'published' ? `/map/${map.id}` : `/editor/${map.id}`}
                        className="btn btn-primary btn-sm flex-1"
                    >
                        {map.status === 'published' ? 'Переглянути' : 'Відкрити'}
                    </Link>
                </div>
            )}
        </div>
    );
}
