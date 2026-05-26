import type { KnowledgeMap } from '../api/knowledgeMaps';
import { isMapGraphNotValidated } from '../utils/mapValidation';

type MapLike = Pick<KnowledgeMap, 'status' | 'graphValidated'>;

export default function MapGraphValidationBadge({ map }: { map: MapLike | null | undefined }) {
    if (!map || map.status !== 'published' || !isMapGraphNotValidated(map.graphValidated)) {
        return null;
    }

    return (
        <span className="badge badge-warning badge-sm" title="Граф містить помилки валідації (напр. цикл)">
            не валідовано
        </span>
    );
}
