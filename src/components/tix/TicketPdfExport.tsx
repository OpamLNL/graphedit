import { useMemo, useState } from 'react';
import type { TixTicketCode } from '../../api/tix';
import {
    buildTicketsZip,
    downloadBlob,
    filterTicketsByRange,
    type PdfBarcodeLayout,
} from '../../utils/tixPdf';

type Props = {
    eventNo: string;
    eventName: string;
    eventDate: string;
    tickets: TixTicketCode[];
    onBack: () => void;
};

const DEFAULT_LAYOUT: PdfBarcodeLayout = {
    xPercent: 25,
    yPercent: 70,
    widthPercent: 50,
    heightPercent: 12,
};

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Не вдалося прочитати файл'));
        reader.readAsDataURL(file);
    });
}

export default function TicketPdfExport({
    eventNo,
    eventName,
    eventDate,
    tickets: sessionTickets,
    onBack,
}: Props) {
    const [templateUrl, setTemplateUrl] = useState('');
    const [jsonText, setJsonText] = useState('');
    const [useSession, setUseSession] = useState(sessionTickets.length > 0);
    const [parsedTickets, setParsedTickets] = useState<TixTicketCode[]>([]);
    const [metaNo, setMetaNo] = useState(eventNo);
    const [metaName, setMetaName] = useState(eventName);
    const [metaDate, setMetaDate] = useState(eventDate);

    const [fromNo, setFromNo] = useState(1);
    const [toNo, setToNo] = useState(
        sessionTickets.length
            ? sessionTickets[sessionTickets.length - 1]?.ticketNo ?? 1
            : 1,
    );

    const [layout, setLayout] = useState<PdfBarcodeLayout>(DEFAULT_LAYOUT);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');

    const sourceTickets = useSession(
        () => (useSession ? sessionTickets : parsedTickets),
        [useSession, sessionTickets, parsedTickets],
    );

    const ranged = useMemo(
        () => filterTicketsByRange(sourceTickets, fromNo, toNo),
        [sourceTickets, fromNo, toNo],
    );

    const onTemplate = async (file: File | null) => {
        setError('');
        if (!file) {
            setTemplateUrl('');
            return;
        }
        if (!file.type.startsWith('image/')) {
            setError('Шаблон має бути зображенням (PNG/JPG)');
            return;
        }
        setTemplateUrl(await readFileAsDataUrl(file));
    };

    const applyJson = () => {
        setError('');
        try {
            const raw = JSON.parse(jsonText);
            const list = Array.isArray(raw) ? raw : raw.tickets;
            if (!Array.isArray(list) || !list.length) {
                throw new Error('Очікується tickets: [{ ticketNo, code }]');
            }
            const tickets: TixTicketCode[] = list.map((item: unknown, idx: number) => {
                if (item && typeof item === 'object') {
                    const o = item as { ticketNo?: number; code?: string; barcode?: string };
                    const code = o.code || o.barcode;
                    if (!code) throw new Error(`Немає code у #${idx + 1}`);
                    return { ticketNo: o.ticketNo ?? idx + 1, code: String(code) };
                }
                throw new Error(`Невірний елемент #${idx + 1}`);
            });
            setParsedTickets(tickets);
            setUseSession(false);
            if (!Array.isArray(raw) && raw && typeof raw === 'object') {
                const o = raw as { eventNo?: string | number; name?: string; date?: string };
                if (o.eventNo != null) setMetaNo(String(o.eventNo));
                if (o.name) setMetaName(String(o.name));
                if (o.date) setMetaDate(String(o.date).slice(0, 10));
            }
            const nos = tickets.map((t) => t.ticketNo);
            setFromNo(Math.min(...nos));
            setToNo(Math.max(...nos));
            setProgress(`Завантажено ${tickets.length} квитків з JSON`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Помилка JSON');
        }
    };

    const setLayoutField = (key: keyof PdfBarcodeLayout, value: number) => {
        const v = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
        setLayout((prev) => ({ ...prev, [key]: v }));
    };

    const generate = async () => {
        setError('');
        if (!templateUrl) {
            setError('Завантаж картинку-шаблон');
            return;
        }
        if (!metaNo.trim()) {
            setError('Вкажи номер заходу');
            return;
        }
        if (!ranged.length) {
            setError('У діапазоні немає квитків');
            return;
        }
        setBusy(true);
        setProgress('');
        try {
            const zip = await buildTicketsZip(
                templateUrl,
                {
                    eventNo: metaNo.trim(),
                    eventName: metaName.trim() || 'event',
                    eventDate: metaDate,
                },
                ranged,
                layout,
                (done, total) => setProgress(`PDF ${done} / ${total}`),
            );
            const zipName = `${metaNo.trim()}_${(metaName.trim() || 'tickets').replace(/\s+/g, '_')}_pdf.zip`;
            downloadBlob(zip, zipName);
            setProgress(`Готово: ${ranged.length} PDF у ZIP`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Помилка генерації PDF');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
                ← Меню штрихкодів
            </button>
            <h2 className="text-xl font-bold">PDF квитки</h2>
            <p className="text-sm opacity-70">
                Шаблон + штрихкоди з JSON/сесії → окремий PDF на кожен квиток у ZIP.
            </p>

            <label className="form-control w-full">
                <span className="label-text text-sm opacity-70">Картинка-шаблон</span>
                <input
                    type="file"
                    accept="image/*"
                    className="file-input file-input-bordered w-full"
                    onChange={(e) => void onTemplate(e.target.files?.[0] ?? null)}
                />
            </label>

            {templateUrl && (
                <div className="relative w-full overflow-hidden rounded-xl border border-base-content/15 bg-base-200">
                    <img src={templateUrl} alt="Шаблон" className="w-full h-auto block" />
                    <div
                        className="absolute border-2 border-primary bg-primary/20 pointer-events-none"
                        style={{
                            left: `${layout.xPercent}%`,
                            top: `${layout.yPercent}%`,
                            width: `${layout.widthPercent}%`,
                            height: `${layout.heightPercent}%`,
                        }}
                    />
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                {(
                    [
                        ['xPercent', 'X %'],
                        ['yPercent', 'Y %'],
                        ['widthPercent', 'Ширина %'],
                        ['heightPercent', 'Висота %'],
                    ] as const
                ).map(([key, label]) => (
                    <label key={key} className="form-control w-full">
                        <span className="label-text text-xs opacity-70">{label}</span>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="input input-bordered input-sm w-full"
                            value={layout[key]}
                            onChange={(e) => setLayoutField(key, Number(e.target.value))}
                        />
                    </label>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button
                    type="button"
                    className={`btn btn-sm ${useSession ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={!sessionTickets.length}
                    onClick={() => {
                        setUseSession(true);
                        if (sessionTickets.length) {
                            const nos = sessionTickets.map((t) => t.ticketNo);
                            setFromNo(Math.min(...nos));
                            setToNo(Math.max(...nos));
                        }
                    }}
                >
                    Сесія ({sessionTickets.length})
                </button>
                <button
                    type="button"
                    className={`btn btn-sm ${!useSession ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setUseSession(false)}
                >
                    З JSON
                </button>
            </div>

            {!useSession && (
                <div className="space-y-2">
                    <textarea
                        className="textarea textarea-bordered w-full font-mono text-xs h-32"
                        placeholder='{"eventNo":"1","name":"…","tickets":[{"ticketNo":1,"code":"…"}]}'
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                    />
                    <button type="button" className="btn btn-outline btn-sm w-full" onClick={applyJson}>
                        Завантажити JSON
                    </button>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <label className="form-control w-full">
                    <span className="label-text text-sm opacity-70">Номер заходу</span>
                    <input
                        className="input input-bordered w-full font-mono"
                        value={metaNo}
                        onChange={(e) => setMetaNo(e.target.value)}
                    />
                </label>
                <label className="form-control w-full">
                    <span className="label-text text-sm opacity-70">Назва заходу</span>
                    <input
                        className="input input-bordered w-full"
                        value={metaName}
                        onChange={(e) => setMetaName(e.target.value)}
                    />
                </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label className="form-control w-full">
                    <span className="label-text text-sm opacity-70">Квитки з №</span>
                    <input
                        type="number"
                        min={1}
                        className="input input-bordered w-full"
                        value={fromNo}
                        onChange={(e) => setFromNo(Number(e.target.value) || 1)}
                    />
                </label>
                <label className="form-control w-full">
                    <span className="label-text text-sm opacity-70">по №</span>
                    <input
                        type="number"
                        min={1}
                        className="input input-bordered w-full"
                        value={toNo}
                        onChange={(e) => setToNo(Number(e.target.value) || 1)}
                    />
                </label>
            </div>

            <p className="text-sm opacity-70">
                У діапазоні: <span className="font-semibold">{ranged.length}</span> квитків
                {sourceTickets.length ? ` (усього в джерелі ${sourceTickets.length})` : ''}
            </p>

            {error && <p className="text-sm text-error">{error}</p>}
            {progress && <p className="text-sm opacity-80">{progress}</p>}

            <button
                type="button"
                className="btn btn-primary w-full"
                disabled={busy}
                onClick={() => void generate()}
            >
                {busy ? 'Генерація…' : `Згенерувати ZIP (${ranged.length} PDF)`}
            </button>
        </div>
    );
}
