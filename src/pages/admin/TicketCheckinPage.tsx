import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/client';
import {
    tixApi,
    type TixGeneratedCodes,
    type TixStats,
    type TixTicketCode,
} from '../../api/tix';
import BarcodeScanner from '../../components/tix/BarcodeScanner';
import TicketBarcodeImage from '../../components/tix/TicketBarcodeImage';

type Screen = 'hub' | 'generate' | 'import' | 'checkin' | 'scan-login' | 'scan';

const STORAGE_KEY = 'tix-checkin-state-v2';

type PersistedState = {
    screen: Screen;
    eventNo: number;
    eventDate: string;
    eventSalt: string;
    eventName: string;
    ticketCount: number;
    accessCode: string;
    tickets: TixTicketCode[];
    generatedJson: TixGeneratedCodes | null;
    persistedInDb: boolean;
    eventId?: number;
    statusMsg: string;
};

function todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function loadState(): Partial<PersistedState> | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as PersistedState;
    } catch {
        return null;
    }
}

export default function TicketCheckinPage() {
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const saved = loadState();

    const [screen, setScreen] = useState<Screen>(saved?.screen ?? 'hub');
    const [eventNo, setEventNo] = useState(saved?.eventNo ?? 1);
    const [eventDate, setEventDate] = useState(saved?.eventDate ?? todayIso());
    const [eventSalt, setEventSalt] = useState(saved?.eventSalt ?? '');
    const [eventName, setEventName] = useState(saved?.eventName ?? '');
    const [ticketCount, setTicketCount] = useState(saved?.ticketCount ?? 50);
    const [importText, setImportText] = useState('');
    const [accessCode, setAccessCode] = useState(saved?.accessCode ?? '');
    const [tickets, setTickets] = useState<TixTicketCode[]>(saved?.tickets ?? []);
    const [generatedJson, setGeneratedJson] = useState<TixGeneratedCodes | null>(
        saved?.generatedJson ?? null,
    );
    const [persistedInDb, setPersistedInDb] = useState(saved?.persistedInDb ?? false);
    const [eventId, setEventId] = useState<number | undefined>(saved?.eventId);
    const [statusMsg, setStatusMsg] = useState(saved?.statusMsg ?? '');
    const [busy, setBusy] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    const [manualCode, setManualCode] = useState('');
    const [lastResult, setLastResult] = useState<'ok' | 'reject' | null>(null);
    const [lastMessage, setLastMessage] = useState('');
    const [stats, setStats] = useState<TixStats | null>(null);
    const [scannerOn, setScannerOn] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [previewTicketNo, setPreviewTicketNo] = useState(1);
    const [scanEventNo, setScanEventNo] = useState<number>(saved?.eventNo ?? 1);

    const canVerifyInDb = persistedInDb && eventNo >= 1;

    useEffect(() => {
        if (!user) return navigate('/');
        if (role !== 'admin') return navigate('/');
    }, [user, role, navigate]);

    useEffect(() => {
        setHydrated(true);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        const payload: PersistedState = {
            screen,
            eventNo,
            eventDate,
            eventSalt,
            eventName,
            ticketCount,
            accessCode,
            tickets,
            generatedJson,
            persistedInDb,
            eventId,
            statusMsg,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }, [
        hydrated,
        screen,
        eventNo,
        eventDate,
        eventSalt,
        eventName,
        ticketCount,
        accessCode,
        tickets,
        generatedJson,
        persistedInDb,
        eventId,
        statusMsg,
    ]);

    const clearSession = () => {
        localStorage.removeItem(STORAGE_KEY);
        setScreen('hub');
        setEventNo(1);
        setEventDate(todayIso());
        setEventSalt('');
        setEventName('');
        setTicketCount(50);
        setAccessCode('');
        setTickets([]);
        setGeneratedJson(null);
        setPersistedInDb(false);
        setEventId(undefined);
        setStatusMsg('');
        setLastResult(null);
        setLastMessage('');
        setImportText('');
        setStats(null);
        setScannerOn(true);
    };

    const goHub = () => {
        setScreen('hub');
        setStatusMsg('');
        setLastResult(null);
        setLastMessage('');
    };

    const openGenerate = () => {
        setStatusMsg('');
        setScreen('generate');
    };

    const openImport = () => {
        setImportText('');
        setStatusMsg('');
        setScreen('import');
    };

    const openScanLogin = () => {
        setScanEventNo(eventNo || 1);
        setStatusMsg('');
        setLastResult(null);
        setLastMessage('');
        setScreen('scan-login');
    };

    const handleScanLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const no = Number(scanEventNo);
        if (!no || no < 1) {
            setStatusMsg('Введіть номер заходу');
            return;
        }
        setBusy(true);
        setStatusMsg('');
        try {
            const ev = await tixApi.getByEventNo(no, true);
            setEventNo(ev.eventNo ?? no);
            setEventName(ev.name);
            setEventId(ev.id);
            if (ev.eventDate) setEventDate(String(ev.eventDate).slice(0, 10));
            setPersistedInDb(true);
            setStats(ev.stats);
            const list = (ev.tickets ?? []).map((t) => ({
                ticketNo: t.ticketNo,
                code: t.code || t.barcode,
            }));
            setTickets(list);
            setPreviewTicketNo(list[0]?.ticketNo ?? 1);
            setGeneratedJson(null);
            setAccessCode('');
            setStatusMsg('');
            setScreen('scan');
        } catch (err) {
            setStatusMsg(
                err instanceof ApiError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'Захід не знайдено',
            );
        } finally {
            setBusy(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        const salt = eventSalt.trim();
        if (!eventNo || eventNo < 1 || !eventDate || !salt || !ticketCount) {
            setStatusMsg('Вкажіть номер, дату, код заходу (сіль) і кількість квитків.');
            return;
        }
        setBusy(true);
        setStatusMsg('');
        try {
            const result = await tixApi.generateCodes({
                eventNo: Number(eventNo),
                date: eventDate,
                accessCode: salt,
                ticketCount: Number(ticketCount),
                name: eventName.trim() || undefined,
                persist: false,
            });
            setGeneratedJson(result);
            setAccessCode(result.accessCode);
            setEventName(result.name);
            setTickets(result.tickets);
            setPersistedInDb(false);
            setEventId(undefined);
            setStatusMsg(
                `Згенеровано ${result.tickets.length} кодів. Натисни «Забити у базу», щоб зберегти.`,
            );
            setScreen('checkin');
        } catch (err) {
            const msg =
                err instanceof ApiError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'Помилка генерації';
            setStatusMsg(msg);
        } finally {
            setBusy(false);
        }
    };

    const handleImport = (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const raw = JSON.parse(importText);
            const list = Array.isArray(raw) ? raw : raw.tickets;
            if (!Array.isArray(list) || list.length === 0) {
                throw new Error('Очікується масив квитків або { tickets: [...] }');
            }
            const parsed = list.map((item: unknown, idx: number) => {
                if (typeof item === 'string') {
                    return { ticketNo: idx + 1, code: item };
                }
                if (item && typeof item === 'object') {
                    const o = item as {
                        ticketNo?: number;
                        barcode?: string;
                        code?: string;
                    };
                    const code = o.code || o.barcode;
                    if (!code) throw new Error(`Немає code у елементі #${idx + 1}`);
                    return { ticketNo: o.ticketNo ?? idx + 1, code: String(code) };
                }
                throw new Error(`Невірний формат елемента #${idx + 1}`);
            });
            const codeFromJson =
                !Array.isArray(raw) && raw && typeof raw === 'object'
                    ? String(
                          (raw as { accessCode?: string }).accessCode ||
                              (raw as { eventSalt?: string }).eventSalt ||
                              '',
                      )
                    : '';
            if (!codeFromJson.trim()) {
                throw new Error('У JSON потрібен accessCode (код заходу / сіль)');
            }
            const nameFromJson =
                !Array.isArray(raw) && raw && typeof raw === 'object'
                    ? String(
                          (raw as { name?: string }).name ||
                              (raw as { eventName?: string }).eventName ||
                              '',
                      )
                    : '';
            setAccessCode(codeFromJson);
            setEventSalt(codeFromJson);
            setEventName(nameFromJson);
            if (!Array.isArray(raw) && raw && typeof raw === 'object') {
                if ((raw as { eventNo?: number }).eventNo) {
                    setEventNo(Number((raw as { eventNo: number }).eventNo));
                }
                if ((raw as { date?: string }).date) {
                    setEventDate(String((raw as { date: string }).date));
                }
            }
            setTickets(parsed);
            setGeneratedJson({
                eventNo: Number((raw as { eventNo?: number }).eventNo) || eventNo,
                date: String((raw as { date?: string }).date || eventDate),
                accessCode: codeFromJson,
                name: nameFromJson,
                persisted: false,
                tickets: parsed,
            });
            setPersistedInDb(false);
            setEventId(undefined);
            setStatusMsg(
                `Завантажено ${parsed.length} кодів. Натисни «Забити у базу», щоб зберегти.`,
            );
            setScreen('checkin');
        } catch (err) {
            setStatusMsg(err instanceof Error ? err.message : 'Помилка розбору JSON');
        }
    };

    const handleSaveToDb = async () => {
        if (!accessCode.trim() || !tickets.length) {
            setStatusMsg('Немає кодів для збереження.');
            return;
        }
        if (persistedInDb) {
            setStatusMsg('Уже збережено в базі.');
            return;
        }
        setBusy(true);
        setStatusMsg('');
        try {
            const savedEvent = await tixApi.saveToDb({
                name: eventName.trim() || undefined,
                eventNo: Number(eventNo),
                date: eventDate,
                accessCode: accessCode.trim(),
                tickets,
            });
            if (savedEvent.eventNo) setEventNo(savedEvent.eventNo);
            setPersistedInDb(true);
            setEventId(savedEvent.id);
            setGeneratedJson((prev) =>
                prev
                    ? { ...prev, persisted: true, eventId: savedEvent.id }
                    : prev,
            );
            setStats(savedEvent.stats);
            setStatusMsg(
                `Збережено в БД: event #${savedEvent.id}, квитків ${savedEvent.stats.total}.`,
            );
        } catch (err) {
            const msg =
                err instanceof ApiError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'Помилка збереження';
            setStatusMsg(msg);
        } finally {
            setBusy(false);
        }
    };

    const downloadJson = () => {
        if (!tickets.length) return;
        const payload =
            generatedJson ??
            ({
                eventNo,
                date: eventDate,
                accessCode,
                name: eventName || undefined,
                tickets: tickets.map((t) => ({ ticketNo: t.ticketNo, code: t.code })),
            } as const);
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tickets-${accessCode || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const verifyCode = useCallback(
        async (code: string) => {
            const barcode = code.trim();
            if (!barcode) {
                setLastResult('reject');
                setLastMessage('Порожній штрихкод');
                return;
            }
            if (!canVerifyInDb) {
                setLastResult('reject');
                setLastMessage('Немає активного заходу з БД');
                return;
            }
            if (scanning) return;

            setScanning(true);
            setLastResult(null);
            setLastMessage('Перевірка…');
            try {
                const result = await tixApi.scan({
                    eventNo: Number(eventNo),
                    barcode,
                });
                setStats(result.stats);
                if (result.ok) {
                    setLastResult('ok');
                    setLastMessage(result.message);
                } else {
                    setLastResult('reject');
                    setLastMessage(result.message);
                }
            } catch (err) {
                setLastResult('reject');
                setLastMessage(
                    err instanceof ApiError
                        ? err.message
                        : err instanceof Error
                          ? err.message
                          : 'Помилка скану',
                );
            } finally {
                setScanning(false);
            }
        },
        [eventNo, canVerifyInDb, scanning],
    );

    const handleManualScan = (e: React.FormEvent) => {
        e.preventDefault();
        const code = manualCode.trim();
        if (!code) return;
        setManualCode('');
        void verifyCode(code);
    };

    useEffect(() => {
        if ((screen !== 'checkin' && screen !== 'scan') || !canVerifyInDb) return;
        let cancelled = false;
        tixApi
            .getByEventNo(Number(eventNo), screen === 'scan')
            .then((ev) => {
                if (cancelled) return;
                setStats(ev.stats);
                if (screen === 'scan' && ev.tickets?.length) {
                    setTickets(
                        ev.tickets.map((t) => ({
                            ticketNo: t.ticketNo,
                            code: t.code || t.barcode,
                        })),
                    );
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [screen, canVerifyInDb, eventNo]);

    if (role !== 'admin') {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    return (
        <div className="max-w-xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Квитки / штрихкоди</h1>
                    <p className="text-xs text-primary font-mono mt-1">UI v2 · gen/import</p>
                </div>
                <Link to="/admin/adminPage" className="btn btn-ghost btn-sm">
                    ← Адмінка
                </Link>
            </div>

            {screen === 'hub' && (
                <div className="space-y-4">
                    <button
                        type="button"
                        className="btn btn-primary btn-lg w-full"
                        onClick={openScanLogin}
                    >
                        Сканування штрихкодів
                    </button>
                    <div className="divider text-xs opacity-50">підготовка квитків</div>
                    <button type="button" className="btn btn-outline w-full" onClick={openGenerate}>
                        Згенерувати штрихкоди
                    </button>
                    <button type="button" className="btn btn-outline w-full" onClick={openImport}>
                        Імпорт з JSON
                    </button>
                    {tickets.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-ghost w-full"
                            onClick={() => setScreen('checkin')}
                        >
                            Сесія генерації ({tickets.length} квитків)
                        </button>
                    )}
                    {(tickets.length > 0 || canVerifyInDb) && (
                        <button type="button" className="btn btn-ghost btn-sm w-full" onClick={clearSession}>
                            Очистити сесію
                        </button>
                    )}
                </div>
            )}

            {screen === 'scan-login' && (
                <form onSubmit={handleScanLogin} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Назад
                    </button>
                    <h2 className="text-xl font-bold">Сканування</h2>
                    <p className="text-sm opacity-70">
                        Введи номер заходу (квитки мають бути вже в базі).
                    </p>
                    <input
                        type="number"
                        min={1}
                        className="input input-bordered w-full font-mono"
                        placeholder="Номер заходу"
                        value={scanEventNo}
                        onChange={(e) => setScanEventNo(Number(e.target.value))}
                        autoFocus
                        required
                    />
                    {statusMsg && <p className="text-sm text-error">{statusMsg}</p>}
                    <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                        {busy ? 'Завантаження…' : 'Відкрити сканер'}
                    </button>
                </form>
            )}

            {screen === 'scan' && (
                <div className="space-y-6">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                            ← Меню
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={openScanLogin}
                        >
                            Інший захід
                        </button>
                    </div>

                    <div className="rounded-xl border border-base-content/10 p-4 space-y-1">
                        {eventName && <div className="font-semibold">{eventName}</div>}
                        <div className="text-xs opacity-60">Номер заходу</div>
                        <div className="font-mono text-lg font-semibold">№{eventNo}</div>
                        <div className="text-sm opacity-70">Квитків: {tickets.length}</div>
                    </div>

                    {tickets.length > 0 && (
                        <div className="rounded-xl border border-base-content/10 p-4 space-y-3">
                            <h2 className="font-semibold">Штрихкод (Code128)</h2>
                            <p className="text-sm opacity-70">
                                Картинка для тесту / друку. Наведи камеру на неї.
                            </p>
                            <label className="form-control w-full max-w-xs">
                                <span className="label-text text-sm opacity-70">№ квитка</span>
                                <select
                                    className="select select-bordered select-sm"
                                    value={previewTicketNo}
                                    onChange={(e) => setPreviewTicketNo(Number(e.target.value))}
                                >
                                    {tickets.map((t) => (
                                        <option key={t.ticketNo} value={t.ticketNo}>
                                            №{t.ticketNo}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {(() => {
                                const t =
                                    tickets.find((x) => x.ticketNo === previewTicketNo) ||
                                    tickets[0];
                                return t ? (
                                    <TicketBarcodeImage
                                        value={t.code}
                                        label={`Квиток №${t.ticketNo}`}
                                    />
                                ) : null;
                            })()}
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="font-semibold">Сканер штрихкодів</h2>
                            <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => setScannerOn((v) => !v)}
                            >
                                {scannerOn ? 'Вимкнути камеру' : 'Увімкнути камеру'}
                            </button>
                        </div>
                        {scannerOn && (
                            <BarcodeScanner
                                onScan={(code) => void verifyCode(code)}
                                paused={scanning}
                            />
                        )}
                    </div>

                    <form onSubmit={handleManualScan} className="space-y-3">
                        <label className="text-sm opacity-70">Або код вручну</label>
                        <input
                            className="input input-bordered w-full font-mono"
                            placeholder="Значення зі штрихкоду"
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            disabled={scanning}
                        />
                        <button
                            type="submit"
                            className="btn btn-primary w-full"
                            disabled={scanning}
                        >
                            {scanning ? 'Перевірка…' : 'Перевірити в БД'}
                        </button>
                    </form>

                    {lastResult && (
                        <div
                            className={`rounded-xl p-4 text-center font-semibold text-lg ${
                                lastResult === 'ok'
                                    ? 'bg-success/20 text-success'
                                    : 'bg-error/20 text-error'
                            }`}
                        >
                            {lastMessage}
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">{stats?.total ?? '—'}</div>
                            <div className="text-xs opacity-60">Всього</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">{stats?.used ?? '—'}</div>
                            <div className="text-xs opacity-60">Пройшли</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">{stats?.remaining ?? '—'}</div>
                            <div className="text-xs opacity-60">Залишилось</div>
                        </div>
                    </div>
                </div>
            )}

            {screen === 'generate' && (
                <form onSubmit={handleGenerate} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Назад
                    </button>
                    <p className="text-sm opacity-70">
                        Код заходу = сіль (лише на сервері). У квитку — HMAC-хеш.
                    </p>
                    <label className="form-control w-full">
                        <span className="label-text text-sm opacity-70">Назва (опційно)</span>
                        <input
                            className="input input-bordered w-full"
                            placeholder="Назва концерту"
                            value={eventName}
                            onChange={(e) => setEventName(e.target.value)}
                        />
                    </label>
                    <label className="form-control w-full">
                        <span className="label-text text-sm opacity-70">Номер заходу</span>
                        <input
                            type="number"
                            min={1}
                            className="input input-bordered w-full font-mono"
                            value={eventNo}
                            onChange={(e) => setEventNo(Number(e.target.value))}
                            required
                        />
                    </label>
                    <label className="form-control w-full">
                        <span className="label-text text-sm opacity-70">Дата заходу</span>
                        <input
                            type="date"
                            className="input input-bordered w-full"
                            value={eventDate}
                            onChange={(e) => setEventDate(e.target.value)}
                            required
                        />
                    </label>
                    <label className="form-control w-full">
                        <span className="label-text text-sm opacity-70">
                            Код заходу (сіль) — секретний
                        </span>
                        <input
                            className="input input-bordered w-full font-mono"
                            placeholder="напр. YAS-x7k9m2"
                            value={eventSalt}
                            onChange={(e) => setEventSalt(e.target.value)}
                            required
                            autoComplete="off"
                        />
                    </label>
                    <label className="form-control w-full">
                        <span className="label-text text-sm opacity-70">Кількість квитків</span>
                        <input
                            type="number"
                            min={1}
                            max={5000}
                            className="input input-bordered w-full"
                            value={ticketCount}
                            onChange={(e) => setTicketCount(Number(e.target.value))}
                            required
                        />
                    </label>
                    {statusMsg && <p className="text-sm text-error">{statusMsg}</p>}
                    <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                        {busy ? 'Генерація…' : 'Згенерувати JSON'}
                    </button>
                </form>
            )}

            {screen === 'import' && (
                <form onSubmit={handleImport} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Назад
                    </button>
                    <p className="text-sm opacity-70">
                        Вставте JSON:{' '}
                        <code className="text-xs">{`accessCode + tickets: [{ ticketNo, code }]`}</code>
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full font-mono text-xs h-48"
                        placeholder='{"accessCode":"YAS-x7k9m2","tickets":[{"ticketNo":1,"code":"a3f8…"}]}'
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        required
                    />
                    {statusMsg && <p className="text-sm text-error">{statusMsg}</p>}
                    <button type="submit" className="btn btn-primary w-full">
                        Завантажити в сесію
                    </button>
                </form>
            )}

            {screen === 'checkin' && (
                <div className="space-y-6">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                            ← Меню
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={clearSession}>
                            Нова сесія
                        </button>
                    </div>

                    <div className="rounded-xl border border-base-content/10 p-4 space-y-1">
                        {eventName && <div className="font-semibold">{eventName}</div>}
                        <div className="text-xs opacity-60">Код заходу (сіль / accessCode)</div>
                        <div className="font-mono text-lg font-semibold">{accessCode || '—'}</div>
                        <div className="text-sm opacity-70">Квитків: {tickets.length}</div>
                        <div className="text-sm">
                            БД:{' '}
                            {persistedInDb ? (
                                <span className="text-success font-medium">
                                    збережено{eventId ? ` (#${eventId})` : ''}
                                </span>
                            ) : (
                                <span className="text-warning font-medium">ще не в базі</span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={handleSaveToDb}
                                disabled={busy || persistedInDb || !tickets.length}
                            >
                                {busy ? 'Збереження…' : 'Забити у базу'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={downloadJson}
                            >
                                Завантажити JSON
                            </button>
                        </div>
                    </div>

                    {statusMsg && <p className="text-sm opacity-80">{statusMsg}</p>}

                    {tickets.length > 0 && (
                        <div className="rounded-xl border border-base-content/10 p-4 space-y-3">
                            <h2 className="font-semibold">Штрихкод (Code128)</h2>
                            <p className="text-sm opacity-70">
                                Картинка штрихкоду для друку / тесту. Наведи камеру саме на неї.
                            </p>
                            <label className="form-control w-full max-w-xs">
                                <span className="label-text text-sm opacity-70">№ квитка</span>
                                <select
                                    className="select select-bordered select-sm"
                                    value={previewTicketNo}
                                    onChange={(e) => setPreviewTicketNo(Number(e.target.value))}
                                >
                                    {tickets.map((t) => (
                                        <option key={t.ticketNo} value={t.ticketNo}>
                                            №{t.ticketNo}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            {(() => {
                                const t =
                                    tickets.find((x) => x.ticketNo === previewTicketNo) ||
                                    tickets[0];
                                return t ? (
                                    <TicketBarcodeImage
                                        value={t.code}
                                        label={`Квиток №${t.ticketNo}`}
                                    />
                                ) : null;
                            })()}
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="font-semibold">Сканер камери</h2>
                            <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => setScannerOn((v) => !v)}
                            >
                                {scannerOn ? 'Вимкнути камеру' : 'Увімкнути камеру'}
                            </button>
                        </div>
                        {!canVerifyInDb && (
                            <p className="text-sm text-warning">
                                Спочатку «Забити у базу», або зайди через «Сканування штрихкодів».
                            </p>
                        )}
                        {scannerOn && (
                            <BarcodeScanner
                                onScan={(code) => void verifyCode(code)}
                                paused={scanning || !canVerifyInDb}
                            />
                        )}
                    </div>

                    <form onSubmit={handleManualScan} className="space-y-3">
                        <label className="text-sm opacity-70">Або введіть код вручну</label>
                        <input
                            className="input input-bordered w-full font-mono"
                            placeholder="Значення зі штрихкоду"
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            disabled={scanning}
                        />
                        <button
                            type="submit"
                            className="btn btn-primary w-full"
                            disabled={scanning || !canVerifyInDb}
                        >
                            {scanning ? 'Перевірка…' : 'Перевірити в БД'}
                        </button>
                    </form>

                    {lastResult && (
                        <div
                            className={`rounded-xl p-4 text-center font-semibold text-lg ${
                                lastResult === 'ok'
                                    ? 'bg-success/20 text-success'
                                    : 'bg-error/20 text-error'
                            }`}
                        >
                            {lastMessage}
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">
                                {stats?.total ?? (tickets.length || '—')}
                            </div>
                            <div className="text-xs opacity-60">Всього</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">{stats?.used ?? '—'}</div>
                            <div className="text-xs opacity-60">Пройшли</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">{stats?.remaining ?? '—'}</div>
                            <div className="text-xs opacity-60">Залишилось</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
