import { useMemo, useState } from 'react';
import type { TixTicketCode } from '../../api/tix';

type Props = {
    onBack: () => void;
};

type PdfBarcodeLayout = {
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
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

function filterByRange(
    tickets: TixTicketCode[],
    fromNo: number,
    toNo: number,
): TixTicketCode[] {
    const from = Math.min(fromNo, toNo);
    const to = Math.max(fromNo, toNo);
    return tickets
        .filter((t) => t.ticketNo >= from && t.ticketNo <= to)
        .sort((a, b) => a.ticketNo - b.ticketNo);
}

/** PDF: усе вводиться тут — шаблон, JSON, позиція, діапазон. Без сесії. */
export default function TicketPdfExport({ onBack }: Props) {
    const [templateUrl, setTemplateUrl] = useState('');
    const [jsonText, setJsonText] = useState('');
    const [tickets, setTickets] = useState<TixTicketCode[]>([]);
    const [metaNo, setMetaNo] = useState('');
    const [metaName, setMetaName] = useState('');

    const [fromNo, setFromNo] = useState(1);
    const [toNo, setToNo] = useState(1);

    const [layout, setLayout] = useState<PdfBarcodeLayout>(DEFAULT_LAYOUT);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');

    const ranged = useMemo(
        () => filterByRange(tickets, fromNo, toNo),
        [tickets, fromNo, toNo],
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
        try {
            setTemplateUrl(await readFileAsDataUrl(file));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Помилка файлу');
        }
    };

    const applyJson = () => {
        setError('');
        setProgress('');
        try {
            const raw = JSON.parse(jsonText);
            const list = Array.isArray(raw) ? raw : raw?.tickets;
            if (!Array.isArray(list) || !list.length) {
                throw new Error('Очікується { eventNo, name, tickets: [{ ticketNo, code }] }');
            }
            const next: TixTicketCode[] = list.map((item: unknown, idx: number) => {
                if (item && typeof item === 'object') {
                    const o = item as {
                        ticketNo?: number;
                        code?: string;
                        barcode?: string;
                    };
                    const code = o.code || o.barcode;
                    if (!code) throw new Error(`Немає code у квитку #${idx + 1}`);
                    return {
                        ticketNo: Number(o.ticketNo) || idx + 1,
                        code: String(code),
                    };
                }
                throw new Error(`Невірний елемент #${idx + 1}`);
            });
            setTickets(next);
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                const o = raw as {
                    eventNo?: string | number;
                    name?: string;
                    eventName?: string;
                };
                if (o.eventNo != null && String(o.eventNo).trim()) {
                    setMetaNo(String(o.eventNo).trim());
                }
                const n = o.name || o.eventName;
                if (n) setMetaName(String(n));
            }
            const nos = next.map((t) => t.ticketNo);
            setFromNo(Math.min(...nos));
            setToNo(Math.max(...nos));
            setProgress(`JSON: ${next.length} квитків`);
        } catch (err) {
            setTickets([]);
            setError(err instanceof Error ? err.message : 'Помилка JSON');
        }
    };

    const setLayoutField = (key: keyof PdfBarcodeLayout, raw: string) => {
        const value = Number(raw);
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
            setError('Спочатку завантаж JSON і вкажи діапазон квитків');
            return;
        }
        setBusy(true);
        setProgress('Завантаження бібліотек…');
        try {
            const { buildTicketsZip, downloadBlob } = await import('../../utils/tixPdf');
            const zip = await buildTicketsZip(
                templateUrl,
                {
                    eventNo: metaNo.trim(),
                    eventName: metaName.trim() || 'event',
                },
                ranged,
                layout,
                (done, total) => setProgress(`PDF ${done} / ${total}`),
            );
            downloadBlob(
                zip,
                `${metaNo.trim()}_${(metaName.trim() || 'tickets').replace(/\s+/g, '_')}_pdf.zip`,
            );
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
                1) шаблон 2) JSON зі штрихкодами 3) позиція 4) діапазон → ZIP з окремими PDF
            </p>

            <label className="form-control w-full">
                <span className="label-text text-sm opacity-70">1. Картинка-шаблон</span>
                <input
                    type="file"
                    accept="image/*"
                    className="file-input file-input-bordered w-full"
                    onChange={(e) => void onTemplate(e.target.files?.[0] ?? null)}
                />
            </label>

            {templateUrl ? (
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
            ) : null}

            <div className="space-y-2">
                <span className="label-text text-sm opacity-70">2. JSON квитків</span>
                <textarea
                    className="textarea textarea-bordered w-full font-mono text-xs h-36"
                    placeholder='{"eventNo":"1","name":"Концерт","tickets":[{"ticketNo":1,"code":"…"}]}'
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                />
                <button type="button" className="btn btn-outline btn-sm w-full" onClick={applyJson}>
                    Завантажити JSON
                </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label className="form-control w-full">
                    <span className="label-text text-sm opacity-70">Номер заходу</span>
                    <input
                        className="input input-bordered w-full font-mono"
                        value={metaNo}
                        onChange={(e) => setMetaNo(e.target.value)}
                        placeholder="з JSON або вручну"
                    />
                </label>
                <label className="form-control w-full">
                    <span className="label-text text-sm opacity-70">Назва заходу</span>
                    <input
                        className="input input-bordered w-full"
                        value={metaName}
                        onChange={(e) => setMetaName(e.target.value)}
                        placeholder="з JSON або вручну"
                    />
                </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {(
                    [
                        ['xPercent', '3. X %'],
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
                            onChange={(e) => setLayoutField(key, e.target.value)}
                        />
                    </label>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <label className="form-control w-full">
                    <span className="label-text text-sm opacity-70">4. Квитки з №</span>
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
                У діапазоні: <span className="font-semibold">{ranged.length}</span>
                {tickets.length ? ` (з JSON: ${tickets.length})` : ' — спочатку завантаж JSON'}
            </p>

            {error ? <p className="text-sm text-error">{error}</p> : null}
            {progress ? <p className="text-sm opacity-80">{progress}</p> : null}

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
