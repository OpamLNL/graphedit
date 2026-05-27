import type { GraphEditMap } from '../api/graphEditMaps';

interface MapCardMetaProps {
    map: GraphEditMap;
    currentUserUid?: string | null;
}

function resolveAuthorLabel(map: GraphEditMap, currentUserUid?: string | null): string {
    const uid = map.author?.uid || map.ownerUid;
    const displayName = map.author?.displayName?.trim();
    const isOwnMap = Boolean(uid && currentUserUid && uid === currentUserUid);

    if (displayName && displayName !== 'Невідомий автор') {
        return isOwnMap ? `${displayName} (ви)` : displayName;
    }

    if (isOwnMap) {
        return 'Ви (автор)';
    }

    return 'Невідомий автор';
}

export default function MapCardMeta({ map, currentUserUid }: MapCardMetaProps) {
    const authorLabel = resolveAuthorLabel(map, currentUserUid);
    const showProgress = map.status === 'published' && map.myProgress != null;
    const progress = map.myProgress;

    return (
        <div className="space-y-2.5 pt-0.5 border-t border-base-content/5">
            <p className="text-xs text-base-content/70">
                <span className="font-medium text-base-content/50">Автор:</span>{' '}
                {authorLabel}
            </p>

            {showProgress && progress && progress.total > 0 ? (
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="opacity-60">
                            Мій прогрес · {progress.completed}/{progress.total}
                        </span>
                        <span className="font-semibold text-primary">{progress.percent}%</span>
                    </div>
                    <progress
                        className="progress progress-primary w-full h-1.5"
                        value={progress.percent}
                        max={100}
                    />
                </div>
            ) : showProgress && progress && progress.total === 0 ? (
                <p className="text-[11px] opacity-45">Карта без вузлів для проходження</p>
            ) : map.status === 'published' ? (
                <p className="text-[11px] opacity-45">Ще не розпочато</p>
            ) : (
                <p className="text-[11px] opacity-45">Чернетка — прогрес після публікації</p>
            )}
        </div>
    );
}
