import { Link } from 'react-router-dom';
import type { GraphEditMap } from '../../api/graphEditMaps';

interface AuthorLinkProps {
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

function authorProfilePath(map: GraphEditMap, currentUserUid?: string | null): string | null {
    const uid = map.author?.uid || map.ownerUid;
    const isOwnMap = Boolean(uid && currentUserUid && uid === currentUserUid);

    if (isOwnMap) {
        return '/profile';
    }

    if (map.author?.id) {
        return `/users/${map.author.id}`;
    }

    return null;
}

export function AuthorLink({ map, currentUserUid }: AuthorLinkProps) {
    const label = resolveAuthorLabel(map, currentUserUid);
    const profilePath = authorProfilePath(map, currentUserUid);

    if (!profilePath) {
        return <span>{label}</span>;
    }

    return (
        <Link to={profilePath} className="font-medium hover:text-primary hover:underline">
            {label}
        </Link>
    );
}
