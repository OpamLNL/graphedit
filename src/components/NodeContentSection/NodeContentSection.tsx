import { useCallback, useEffect, useState, type ClipboardEvent } from 'react';
import { apiAssetUrl } from '../../api/client';
import { nodesApi, type NodeContentResponse, type NodeMediaItem } from '../../api/nodes';

const CLIPBOARD_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);

function extractImageFromClipboard(data: DataTransfer): File | null {
    for (const item of data.items) {
        if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file && CLIPBOARD_IMAGE_TYPES.has(file.type)) {
            return file;
        }
    }
    const file = data.files[0];
    if (file?.type.startsWith('image/') && CLIPBOARD_IMAGE_TYPES.has(file.type)) {
        return file;
    }
    return null;
}

function clipboardImageFileName(file: File): string {
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    return `paste-${Date.now()}.${ext}`;
}

interface NodeContentSectionProps {
    nodeId: number | null;
    editable?: boolean;
    /** Якщо на вузлі ще немає теорії — показати в режимі перегляду */
    fallbackDescription?: string | null;
}

export default function NodeContentSection({
    nodeId,
    editable = false,
    fallbackDescription = null,
}: NodeContentSectionProps) {
    const [content, setContent] = useState<NodeContentResponse | null>(null);
    const [theoryDraft, setTheoryDraft] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [caption, setCaption] = useState('');

    const savedNodeId = nodeId != null && nodeId > 0 ? nodeId : null;

    const loadContent = useCallback(async () => {
        if (!savedNodeId) {
            setContent(null);
            setTheoryDraft('');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await nodesApi.getContent(savedNodeId);
            setContent(data);
            setTheoryDraft(data.theoryMd ?? '');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не вдалося завантажити контент');
            setContent(null);
        } finally {
            setLoading(false);
        }
    }, [savedNodeId]);

    useEffect(() => {
        void loadContent();
    }, [loadContent]);

    const handleSaveTheory = async () => {
        if (!savedNodeId) return;
        setSaving(true);
        setError(null);
        try {
            const data = await nodesApi.updateContent(savedNodeId, theoryDraft || null);
            setContent(data);
            setTheoryDraft(data.theoryMd ?? '');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не вдалося зберегти теорію');
        } finally {
            setSaving(false);
        }
    };

    const handleUpload = useCallback(
        async (file: File | null) => {
            if (!savedNodeId || !file) return;
            setUploading(true);
            setError(null);
            try {
                const data = await nodesApi.uploadMedia(savedNodeId, file, caption);
                setContent(data);
                setCaption('');
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Не вдалося завантажити зображення');
            } finally {
                setUploading(false);
            }
        },
        [savedNodeId, caption],
    );

    const handlePasteImage = useCallback(
        (event: ClipboardEvent) => {
            if (!editable || !savedNodeId || uploading) return;
            const file = extractImageFromClipboard(event.clipboardData);
            if (!file) return;
            event.preventDefault();
            const named = new File([file], clipboardImageFileName(file), { type: file.type });
            void handleUpload(named);
        },
        [editable, savedNodeId, uploading, handleUpload],
    );

    const handleDeleteMedia = async (mediaId: number) => {
        if (!savedNodeId) return;
        setError(null);
        try {
            const data = await nodesApi.deleteMedia(savedNodeId, mediaId);
            setContent(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Не вдалося видалити зображення');
        }
    };

    if (!nodeId) return null;

    if (nodeId < 0) {
        return (
            <p className="text-xs opacity-50 border-t border-base-content/10 pt-3 mt-1">
                Збережи вузол на графі, щоб додати теорію та зображення.
            </p>
        );
    }

    if (loading && !content) {
        return <p className="text-xs opacity-50 pt-3">Завантаження контенту...</p>;
    }

    const theoryText = content?.theoryMd?.trim() || '';
    const displayTheory = theoryText || (editable ? '' : fallbackDescription?.trim() || '');
    const media = content?.media ?? [];

    return (
        <div className="space-y-3 border-t border-base-content/10 pt-3 mt-1">
            <p className="text-[10px] uppercase tracking-widest opacity-40">Теорія</p>

            {editable ? (
                <>
                    <textarea
                        className="textarea textarea-bordered textarea-sm w-full min-h-[120px] text-sm"
                        placeholder="Текст теорії для цього вузла..."
                        value={theoryDraft}
                        onChange={(e) => setTheoryDraft(e.target.value)}
                        onPaste={handlePasteImage}
                    />
                    <button
                        type="button"
                        className="btn btn-primary btn-xs w-full"
                        disabled={saving || theoryDraft === (content?.theoryMd ?? '')}
                        onClick={() => void handleSaveTheory()}
                    >
                        {saving ? 'Збереження...' : 'Зберегти теорію'}
                    </button>
                </>
            ) : displayTheory ? (
                <p className="text-sm whitespace-pre-wrap opacity-85 leading-relaxed">{displayTheory}</p>
            ) : (
                <p className="text-xs opacity-45 italic">Теорія ще не додана</p>
            )}

            <p className="text-[10px] uppercase tracking-widest opacity-40 pt-1">Зображення</p>

            {editable && (
                <div
                    className="space-y-2 rounded-lg border border-dashed border-base-content/15 p-2 outline-none focus-within:border-primary/40"
                    tabIndex={0}
                    onPaste={handlePasteImage}
                >
                    <input
                        type="text"
                        className="input input-bordered input-xs w-full"
                        placeholder="Підпис (необовʼязково)"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                    />
                    <label className="btn btn-outline btn-xs w-full cursor-pointer">
                        {uploading ? 'Завантаження...' : 'Додати зображення'}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            disabled={uploading}
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                void handleUpload(file);
                                e.target.value = '';
                            }}
                        />
                    </label>
                    <p className="text-[10px] opacity-45 text-center">
                        Або натисніть тут і вставте скріншот: Ctrl+V
                    </p>
                </div>
            )}

            {media.length > 0 ? (
                <ul className="space-y-2">
                    {media.map((item) => (
                        <MediaItem
                            key={item.id}
                            item={item}
                            editable={editable}
                            onDelete={() => void handleDeleteMedia(item.id)}
                        />
                    ))}
                </ul>
            ) : (
                !editable && <p className="text-xs opacity-45 italic">Немає зображень</p>
            )}

            {error && <p className="text-xs text-error">{error}</p>}
        </div>
    );
}

function MediaItem({
    item,
    editable,
    onDelete,
}: {
    item: NodeMediaItem;
    editable: boolean;
    onDelete: () => void;
}) {
    return (
        <li className="rounded-lg border border-base-content/10 overflow-hidden bg-base-200/30">
            <img
                src={apiAssetUrl(item.url)}
                alt={item.caption ?? 'Зображення вузла'}
                className="w-full max-h-40 object-contain bg-base-300/20"
                loading="lazy"
            />
            {(item.caption || editable) && (
                <div className="px-2 py-1.5 flex items-center gap-2">
                    {item.caption && (
                        <p className="text-[11px] opacity-70 flex-1 line-clamp-2">{item.caption}</p>
                    )}
                    {editable && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error shrink-0"
                            onClick={onDelete}
                        >
                            ×
                        </button>
                    )}
                </div>
            )}
        </li>
    );
}
