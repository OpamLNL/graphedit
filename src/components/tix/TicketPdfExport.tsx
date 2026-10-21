import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { tixApi, type TixTicketCode } from '../../api/tix';
import type { PdfBarcodeLayout, PdfBarcodeOrientation } from '../../utils/tixPdf';

type DragMode = 'move' | 'resize-se';

const DEFAULT_LAYOUT: PdfBarcodeLayout = {
    xPercent: 25,
    yPercent: 70,
    widthPercent: 50,
    heightPercent: 12,
    orientation: 'horizontal',
};

function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

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

/** PDF: усе вводиться тут — шаблон, JSON, позиція на картинці, орієнтація, діапазон. */
export default function TicketPdfExport() {
    const [templateUrl, setTemplateUrl] = useState('');
    const [jsonText, setJsonText] = useState('');
    const [tickets, setTickets] = useState<TixTicketCode[]>([]);
    const [metaNo, setMetaNo] = useState('');
    const [metaName, setMetaName] = useState('');

    const [fromNo, setFromNo] = useState(1);
    const [toNo, setToNo] = useState(1);

    const [layout, setLayout] = useState<PdfBarcodeLayout>(DEFAULT_LAYOUT);
    const [busy, setBusy] = useState(false);
    const [dbBusy, setDbBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');

    const previewRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{
        mode: DragMode;
        startX: number;
        startY: number;
        origin: PdfBarcodeLayout;
    } | null>(null);

    const ranged = useMemo(
        () => filterByRange(tickets, fromNo, toNo),
        [tickets, fromNo, toNo],
    );

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const el = previewRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const dx = ((e.clientX - drag.startX) / rect.width) * 100;
            const dy = ((e.clientY - drag.startY) / rect.height) * 100;
            const o = drag.origin;

            if (drag.mode === 'move') {
                setLayout({
                    ...o,
                    xPercent: clamp(o.xPercent + dx, 0, 100 - o.widthPercent),
                    yPercent: clamp(o.yPercent + dy, 0, 100 - o.heightPercent),
                });
                return;
            }

            setLayout({
                ...o,
                widthPercent: clamp(o.widthPercent + dx, 4, 100 - o.xPercent),
                heightPercent: clamp(o.heightPercent + dy, 3, 100 - o.yPercent),
            });
        };
        const onUp = () => {
            dragRef.current = null;
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, []);

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

    const applyTicketList = (
        next: TixTicketCode[],
        opts?: { eventNo?: string; name?: string; keepRange?: boolean },
    ) => {
        if (!next.length) throw new Error('Немає квитків у діапазоні');
        setTickets(next);
        if (opts?.eventNo) setMetaNo(opts.eventNo);
        if (opts?.name) setMetaName(opts.name);
        const nos = next.map((t) => t.ticketNo);
        if (!opts?.keepRange) {
            setFromNo(Math.min(...nos));
            setToNo(Math.max(...nos));
        }
        const payload = {
            eventNo: opts?.eventNo ?? metaNo.trim(),
            name: opts?.name ?? metaName.trim(),
            tickets: next,
        };
        setJsonText(JSON.stringify(payload, null, 2));
        setProgress(`Завантажено: ${next.length} квитків`);
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
            let eventNo = metaNo.trim();
            let name = metaName.trim();
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                const o = raw as {
                    eventNo?: string | number;
                    name?: string;
                    eventName?: string;
                };
                if (o.eventNo != null && String(o.eventNo).trim()) {
                    eventNo = String(o.eventNo).trim();
                }
                const n = o.name || o.eventName;
                if (n) name = String(n);
            }
            applyTicketList(next, { eventNo, name });
        } catch (err) {
            setTickets([]);
            setError(err instanceof Error ? err.message : 'Помилка JSON');
        }
    };

    const loadFromDb = async () => {
        setError('');
        setProgress('');
        const eventNo = metaNo.trim();
        if (!eventNo) {
            setError('Вкажи номер заходу');
            return;
        }
        if (!Number.isFinite(fromNo) || !Number.isFinite(toNo) || fromNo < 1 || toNo < 1) {
            setError('Вкажи діапазон квитків (з № / по №)');
            return;
        }
        setDbBusy(true);
        try {
            const ev = await tixApi.getByEventNo(eventNo, true);
            const all: TixTicketCode[] = (ev.tickets ?? []).map((t) => ({
                ticketNo: t.ticketNo,
                code: String(t.code || t.barcode || ''),
            })).filter((t) => t.code);
            if (!all.length) {
                throw new Error(`У заході №${eventNo} немає квитків у базі`);
            }
            const next = filterByRange(all, fromNo, toNo);
            if (!next.length) {
                const nos = all.map((t) => t.ticketNo);
                throw new Error(
                    `У діапазоні ${Math.min(fromNo, toNo)}–${Math.max(fromNo, toNo)} немає квитків (у базі: ${Math.min(...nos)}–${Math.max(...nos)})`,
                );
            }
            applyTicketList(next, {
                eventNo: String(ev.eventNo ?? eventNo),
                name: ev.name || metaName.trim(),
                keepRange: true,
            });
        } catch (err) {
            setTickets([]);
            setError(err instanceof Error ? err.message : 'Помилка завантаження з бази');
        } finally {
            setDbBusy(false);
        }
    };

    const downloadJson = () => {
        setError('');
        // 1) уже застосовані квитки 2) інакше — текст з поля JSON
        let body = '';
        let count = 0;
        if (ranged.length) {
            body = JSON.stringify(
                {
                    eventNo: metaNo.trim(),
                    name: metaName.trim(),
                    tickets: ranged,
                },
                null,
                2,
            );
            count = ranged.length;
        } else if (tickets.length) {
            body = JSON.stringify(
                {
                    eventNo: metaNo.trim(),
                    name: metaName.trim(),
                    tickets,
                },
                null,
                2,
            );
            count = tickets.length;
        } else if (jsonText.trim()) {
            try {
                body = JSON.stringify(JSON.parse(jsonText), null, 2);
                const raw = JSON.parse(jsonText);
                const list = Array.isArray(raw) ? raw : raw?.tickets;
                count = Array.isArray(list) ? list.length : 0;
            } catch {
                setError('У полі невалідний JSON — спочатку виправ або застосуй');
                return;
            }
        } else {
            setError('Немає імпортованого JSON для скачування');
            return;
        }
        const blob = new Blob([body], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${metaNo.trim() || 'tickets'}_${fromNo}-${toNo}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setProgress(`Скачано JSON: ${count || '—'} квитків`);
    };

    const setOrientation = (orientation: PdfBarcodeOrientation) => {
        setLayout((prev) => {
            if (prev.orientation === orientation) return prev;
            const widthPercent = prev.heightPercent;
            const heightPercent = prev.widthPercent;
            return {
                ...prev,
                orientation,
                widthPercent,
                heightPercent,
                xPercent: clamp(prev.xPercent, 0, 100 - widthPercent),
                yPercent: clamp(prev.yPercent, 0, 100 - heightPercent),
            };
        });
    };

    const onBoxPointerDown = (e: ReactPointerEvent<HTMLDivElement>, mode: DragMode) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
            mode,
            startX: e.clientX,
            startY: e.clientY,
            origin: { ...layout },
        };
    };

    const placeAtClick = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (dragRef.current) return;
        const el = previewRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setLayout((prev) => ({
            ...prev,
            xPercent: clamp(x - prev.widthPercent / 2, 0, 100 - prev.widthPercent),
            yPercent: clamp(y - prev.heightPercent / 2, 0, 100 - prev.heightPercent),
        }));
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
            <h2 className="text-xl font-bold">PDF квитки</h2>
            <p className="text-sm opacity-70">
                1) шаблон 2) квитки з бази або JSON 3) позиція + орієнтація → ZIP
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
                <div className="space-y-2">
                    <span className="label-text text-sm opacity-70">
                        3. Позиція на картинці — перетягни рамку, кут змінює розмір, клік по фону
                        ставить центр
                    </span>
                    <div
                        ref={previewRef}
                        className="relative w-full select-none overflow-hidden rounded-xl border border-base-content/15 bg-base-200 touch-none"
                        onPointerDown={placeAtClick}
                    >
                        <img
                            src={templateUrl}
                            alt="Шаблон"
                            className="w-full h-auto block pointer-events-none"
                            draggable={false}
                        />
                        <div
                            className="absolute border-2 border-primary bg-primary/25 cursor-move"
                            style={{
                                left: `${layout.xPercent}%`,
                                top: `${layout.yPercent}%`,
                                width: `${layout.widthPercent}%`,
                                height: `${layout.heightPercent}%`,
                            }}
                            onPointerDown={(e) => onBoxPointerDown(e, 'move')}
                        >
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-content bg-primary/80 px-1.5 py-0.5 rounded">
                                    {layout.orientation === 'vertical' ? 'верт.' : 'гориз.'}
                                </span>
                            </div>
                            <div
                                className="absolute right-0 bottom-0 w-4 h-4 translate-x-1/2 translate-y-1/2 rounded-sm bg-primary border border-base-100 cursor-se-resize"
                                onPointerDown={(e) => onBoxPointerDown(e, 'resize-se')}
                            />
                        </div>
                    </div>
                    <p className="text-xs opacity-60 font-mono">
                        X {layout.xPercent.toFixed(1)}% · Y {layout.yPercent.toFixed(1)}% · W{' '}
                        {layout.widthPercent.toFixed(1)}% · H {layout.heightPercent.toFixed(1)}%
                    </p>
                </div>
            ) : null}

            <div className="space-y-2">
                <span className="label-text text-sm opacity-70">Орієнтація штрихкоду</span>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className={`btn btn-sm ${layout.orientation === 'horizontal' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setOrientation('horizontal')}
                    >
                        Горизонтальна
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${layout.orientation === 'vertical' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setOrientation('vertical')}
                    >
                        Вертикальна
                    </button>
                </div>
            </div>

            <div className="space-y-3 rounded-xl border border-base-content/10 p-3">
                <span className="label-text text-sm font-medium opacity-80">
                    2. Квитки — з бази або JSON
                </span>

                <div className="grid grid-cols-2 gap-3">
                    <label className="form-control w-full col-span-2 sm:col-span-1">
                        <span className="label-text text-sm opacity-70">Номер заходу</span>
                        <input
                            className="input input-bordered w-full font-mono"
                            value={metaNo}
                            onChange={(e) => setMetaNo(e.target.value)}
                            placeholder="напр. 7"
                        />
                    </label>
                    <label className="form-control w-full col-span-2 sm:col-span-1">
                        <span className="label-text text-sm opacity-70">Назва (опційно)</span>
                        <input
                            className="input input-bordered w-full"
                            value={metaName}
                            onChange={(e) => setMetaName(e.target.value)}
                            placeholder="підтягнеться з бази"
                        />
                    </label>
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

                <button
                    type="button"
                    className="btn btn-primary btn-sm w-full"
                    disabled={dbBusy || busy}
                    onClick={() => void loadFromDb()}
                >
                    {dbBusy ? 'Завантаження…' : 'З бази → JSON'}
                </button>

                <label className="form-control w-full">
                    <span className="label-text text-xs opacity-60">
                        Або встав JSON вручну — застосуй і/або скачай файл
                    </span>
                    <textarea
                        className="textarea textarea-bordered w-full font-mono text-xs h-36"
                        placeholder='{"eventNo":"1","name":"Концерт","tickets":[{"ticketNo":1,"code":"…"}]}'
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                    />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="btn btn-outline btn-sm" onClick={applyJson}>
                        Застосувати JSON
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={downloadJson}>
                        Скачати JSON
                    </button>
                </div>

                <p className="text-sm opacity-70">
                    У діапазоні: <span className="font-semibold">{ranged.length}</span>
                    {tickets.length
                        ? ` (завантажено: ${tickets.length})`
                        : ' — з бази або JSON'}
                </p>
            </div>

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
