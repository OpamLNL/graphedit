import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
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

const TicketPdfExport = lazy(() => import('../../components/tix/TicketPdfExport'));

type Screen =
    | 'hub'
    | 'generate'
    | 'import'
    | 'json-from-db'
    | 'checkin'
    | 'scan-login'
    | 'scan'
    | 'draw-login'
    | 'draw'
    | 'pdf';

const STORAGE_KEY = 'tix-checkin-state-v5';
/** Маркер у history: щоб «назад» з підменю не викидало на /admin/adminPage */
const TIX_HIST_KEY = 'tixInner';

type PersistedState = {
    eventNo: string;
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
    scanEventNo?: string;
};

function asEventNoText(value: unknown): string {
    if (value == null || value === '') return '';
    return String(value);
}

function todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function loadState(): Partial<PersistedState> | null {
    try {
        const raw =
            localStorage.getItem(STORAGE_KEY) ||
            localStorage.getItem('tix-checkin-state-v3');
        if (!raw) return null;
        return JSON.parse(raw) as PersistedState;
    } catch {
        return null;
    }
}

export default function TicketCheckinPage() {
    const { user, role, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const saved = loadState();

    // Меню з трьома кнопками — завжди при відкритті сторінки
    const [screen, setScreen] = useState<Screen>('hub');
    const [eventNo, setEventNo] = useState(() => asEventNoText(saved?.eventNo));
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
    /** Після результату скану — чекаємо кнопку ДАЛІ, камера не приймає нові коди */
    const [awaitingNext, setAwaitingNext] = useState(false);
    const [previewTicketNo, setPreviewTicketNo] = useState(1);
    const [scanEventNo, setScanEventNo] = useState(() =>
        asEventNoText(saved?.scanEventNo ?? saved?.eventNo),
    );
    /** false = новий захід; true = догенерувати квитки до існуючого */
    const [appendMode, setAppendMode] = useState(false);

    /** JSON з бази: діапазон + зібраний текст */
    const [dbJsonFromNo, setDbJsonFromNo] = useState(1);
    const [dbJsonToNo, setDbJsonToNo] = useState(50);
    const [dbJsonText, setDbJsonText] = useState('');

    const canVerifyInDb = persistedInDb && eventNo.trim().length > 0;

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            navigate('/');
            return;
        }
        // Не кидати на головну, поки роль ще підтягується
        if (role != null && role !== 'admin') navigate('/');
    }, [user, role, authLoading, navigate]);

    useEffect(() => {
        setHydrated(true);
    }, []);

    /** Браузерне «назад» з PDF/скану тощо → меню штрихкодів, не адмінка */
    useEffect(() => {
        const onPopState = () => {
            setScreen('hub');
            setStatusMsg('');
            setLastResult(null);
            setLastMessage('');
            setAwaitingNext(false);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        const payload: PersistedState = {
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
            scanEventNo,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }, [
        hydrated,
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
        scanEventNo,
    ]);

    /** З хаба в підменю — додаємо history entry, щоб Back лишав на цій сторінці */
    const leaveHub = (next: Screen) => {
        if (next === 'hub') {
            setScreen('hub');
            return;
        }
        if (screen === 'hub') {
            window.history.pushState({ [TIX_HIST_KEY]: next }, '');
        }
        setScreen(next);
    };

    const goHub = () => {
        setStatusMsg('');
        setLastResult(null);
        setLastMessage('');
        setAwaitingNext(false);
        const st = window.history.state as Record<string, unknown> | null;
        if (st && st[TIX_HIST_KEY]) {
            window.history.back();
            return;
        }
        setScreen('hub');
    };

    const clearSession = () => {
        localStorage.removeItem(STORAGE_KEY);
        setEventNo('');
        setScanEventNo('');
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
        setAwaitingNext(false);
        setImportText('');
        setStats(null);
        setScannerOn(true);
        setScreen('hub');
        if ((window.history.state as Record<string, unknown> | null)?.[TIX_HIST_KEY]) {
            window.history.replaceState(null, '');
        }
    };

    const readyForNextScan = () => {
        setLastResult(null);
        setLastMessage('');
        setAwaitingNext(false);
        setManualCode('');
    };

    const openGenerate = () => {
        setStatusMsg('');
        leaveHub('generate');
    };

    const openImport = () => {
        setImportText('');
        setStatusMsg('');
        leaveHub('import');
    };

    const openJsonFromDb = () => {
        setStatusMsg('');
        setDbJsonText('');
        setScanEventNo(eventNo || scanEventNo);
        leaveHub('json-from-db');
    };

    const loadJsonFromDb = async () => {
        const no = scanEventNo.trim();
        if (!no) {
            setStatusMsg('Вкажи номер заходу');
            return;
        }
        const from = Math.min(dbJsonFromNo, dbJsonToNo);
        const to = Math.max(dbJsonFromNo, dbJsonToNo);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1) {
            setStatusMsg('Вкажи діапазон квитків');
            return;
        }
        setBusy(true);
        setStatusMsg('');
        try {
            const ev = await tixApi.getByEventNo(no, true);
            const all = (ev.tickets ?? [])
                .map((t) => ({
                    ticketNo: t.ticketNo,
                    code: String(t.code || t.barcode || ''),
                }))
                .filter((t) => t.code);
            if (!all.length) {
                throw new Error(`У заході №${ev.eventNo ?? no} немає квитків у базі`);
            }
            const ranged = all
                .filter((t) => t.ticketNo >= from && t.ticketNo <= to)
                .sort((a, b) => a.ticketNo - b.ticketNo);
            if (!ranged.length) {
                const nos = all.map((t) => t.ticketNo);
                throw new Error(
                    `У діапазоні ${from}–${to} немає квитків (у базі: ${Math.min(...nos)}–${Math.max(...nos)})`,
                );
            }
            const payload = {
                eventNo: String(ev.eventNo ?? no),
                name: ev.name || undefined,
                date: ev.eventDate ? String(ev.eventDate).slice(0, 10) : undefined,
                tickets: ranged,
            };
            const text = JSON.stringify(payload, null, 2);
            setDbJsonText(text);
            setEventNo(payload.eventNo);
            setEventName(ev.name || '');
            if (payload.date) setEventDate(payload.date);
            setTickets(ranged);
            setPersistedInDb(true);
            setEventId(ev.id);
            setStats(ev.stats);
            setStatusMsg(`Готово: ${ranged.length} квитків (№${from}–№${to})`);
        } catch (err) {
            setDbJsonText('');
            setStatusMsg(
                err instanceof ApiError
                    ? err.message
                    : err instanceof Error
                      ? err.message
                      : 'Помилка завантаження з бази',
            );
        } finally {
            setBusy(false);
        }
    };

    const downloadDbJson = () => {
        if (!dbJsonText.trim()) {
            setStatusMsg('Спочатку завантаж JSON з бази');
            return;
        }
        const blob = new Blob([dbJsonText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${scanEventNo.trim() || 'tickets'}_${dbJsonFromNo}-${dbJsonToNo}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const loadEventByNo = async (no: string, nextScreen: 'scan' | 'draw') => {
        const code = no.trim();
        if (!code) {
            setStatusMsg('Введіть номер заходу');
            return;
        }
        setBusy(true);
        setStatusMsg('');
        try {
            const ev = await tixApi.getByEventNo(code, true);
            setEventNo(ev.eventNo ?? code);
            setScanEventNo(ev.eventNo ?? code);
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
            if (nextScreen === 'scan') {
                setLastResult(null);
                setLastMessage('');
                setAwaitingNext(false);
                setScanning(false);
                setScannerOn(true);
                setManualCode('');
            }
            setScreen(nextScreen);
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

    const openScanLogin = () => {
        setScanEventNo(eventNo);
        setStatusMsg('');
        setLastResult(null);
        setLastMessage('');
        setAwaitingNext(false);
        leaveHub('scan-login');
    };

    const openDrawLogin = () => {
        setScanEventNo(eventNo);
        setStatusMsg('');
        leaveHub('draw-login');
    };

    const handleScanLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        await loadEventByNo(scanEventNo, 'scan');
    };

    const handleDrawLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        await loadEventByNo(scanEventNo, 'draw');
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        const salt = eventSalt.trim();
        const no = eventNo.trim();
        if (!no || !salt || !ticketCount) {
            setStatusMsg('Вкажіть номер заходу, сіль і кількість квитків.');
            return;
        }

        if (appendMode) {
            setBusy(true);
            setStatusMsg('');
            try {
                const result = await tixApi.appendCodes({
                    eventNo: no,
                    accessCode: salt,
                    ticketCount: Number(ticketCount),
                });
                const list = result.tickets?.length
                    ? result.tickets
                    : result.appended;
                setEventNo(String(result.eventNo ?? no));
                if (result.date) setEventDate(String(result.date).slice(0, 10));
                setEventName(result.name);
                setAccessCode(salt);
                setEventSalt(salt);
                setTickets(list);
                setPreviewTicketNo(
                    result.appended[0]?.ticketNo ?? list[list.length - 1]?.ticketNo ?? 1,
                );
                setPersistedInDb(true);
                setEventId(result.eventId);
                setStats(result.stats);
                setGeneratedJson({
                    eventNo: String(result.eventNo ?? no),
                    date: String(result.date).slice(0, 10),
                    accessCode: salt,
                    name: result.name,
                    eventId: result.eventId,
                    persisted: true,
                    tickets: list,
                });
                setStatusMsg(
                    `Додано квитки №${result.appendedFrom}–№${
                        result.appendedFrom + result.appendedCount - 1
                    } до заходу «${result.eventNo}». Усього ${result.stats.total}.`,
                );
                setScreen('checkin');
            } catch (err) {
                setStatusMsg(
                    err instanceof ApiError
                        ? err.message
                        : err instanceof Error
                          ? err.message
                          : 'Помилка догенерації',
                );
            } finally {
                setBusy(false);
            }
            return;
        }

        if (!eventDate) {
            setStatusMsg('Вкажіть дату заходу.');
            return;
        }

        setBusy(true);
        setStatusMsg('');
        try {
            const result = await tixApi.generateCodes({
                eventNo: no,
                date: eventDate,
                accessCode: salt,
                ticketCount: Number(ticketCount),
                name: eventName.trim() || undefined,
                persist: true,
            });
            setGeneratedJson(result);
            setAccessCode(result.accessCode);
            setEventName(result.name);
            setEventNo(result.eventNo);
            setTickets(result.tickets);
            setPreviewTicketNo(result.tickets[0]?.ticketNo ?? 1);
            setPersistedInDb(Boolean(result.persisted));
            setEventId(result.eventId);
            setStatusMsg(
                result.persisted
                    ? `Захід «${result.eventNo}»: збережено ${result.tickets.length} квитків (№1–№${result.tickets.length}).`
                    : `Згенеровано ${result.tickets.length} кодів. Натисни «Забити у базу».`,
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
            const eventNoFromJson =
                !Array.isArray(raw) && raw && typeof raw === 'object'
                    ? asEventNoText((raw as { eventNo?: string | number }).eventNo).trim()
                    : '';
            if (!eventNoFromJson) {
                throw new Error('У JSON потрібен eventNo (номер/код заходу)');
            }
            const dateFromJson =
                !Array.isArray(raw) && raw && typeof raw === 'object'
                    ? String((raw as { date?: string }).date || '')
                    : '';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFromJson)) {
                throw new Error('У JSON потрібна date у форматі YYYY-MM-DD');
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
            setEventNo(eventNoFromJson);
            setEventDate(dateFromJson);
            setTickets(parsed);
            setGeneratedJson({
                eventNo: eventNoFromJson,
                date: dateFromJson,
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
        if (!eventNo.trim() || !eventDate) {
            setStatusMsg('Потрібні номер і дата заходу перед збереженням.');
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
                eventNo: eventNo.trim(),
                date: eventDate,
                accessCode: accessCode.trim(),
                tickets,
            });
            if (savedEvent.eventNo) setEventNo(String(savedEvent.eventNo));
            setPersistedInDb(true);
            setEventId(savedEvent.id);
            setGeneratedJson((prev) =>
                prev
                    ? { ...prev, persisted: true, eventId: savedEvent.id }
                    : prev,
            );
            setStats(savedEvent.stats);
            setStatusMsg(
                `Збережено захід №${savedEvent.eventNo ?? eventNo}: квитків ${savedEvent.stats.total} (номери квитків, не id рядка).`,
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
            if (!barcode) return;
            if (!canVerifyInDb) {
                setLastResult('reject');
                setLastMessage('Немає активного заходу з БД');
                setAwaitingNext(true);
                return;
            }
            if (scanning || awaitingNext) return;

            setScanning(true);
            setLastResult(null);
            setLastMessage('Перевірка…');
            try {
                const result = await tixApi.scan({
                    eventNo: eventNo.trim(),
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
                setAwaitingNext(true);
            } catch (err) {
                setLastResult('reject');
                setLastMessage(
                    err instanceof ApiError
                        ? err.message
                        : err instanceof Error
                          ? err.message
                          : 'Помилка скану',
                );
                setAwaitingNext(true);
            } finally {
                setScanning(false);
            }
        },
        [eventNo, canVerifyInDb, scanning, awaitingNext],
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
            .getByEventNo(eventNo.trim(), screen === 'scan')
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

    if (authLoading || role !== 'admin') {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    return (
        <div className="max-w-xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Квитки / штрихкоди</h1>
                </div>
                {screen === 'hub' ? (
                    <Link to="/admin/adminPage" className="btn btn-ghost btn-sm">
                        ← Адмінка
                    </Link>
                ) : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Меню штрихкодів
                    </button>
                )}
            </div>

            {screen === 'hub' && (
                <div className="space-y-3">
                    <button
                        type="button"
                        className="btn btn-primary btn-lg w-full h-16 text-lg"
                        onClick={openScanLogin}
                    >
                        СКАНУВАТИ
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary btn-lg w-full h-16 text-lg"
                        onClick={openGenerate}
                    >
                        ГЕНЕРУВАТИ
                    </button>
                    <button
                        type="button"
                        className="btn btn-accent btn-lg w-full h-16 text-lg"
                        onClick={openDrawLogin}
                    >
                        НАМАЛЮВАТИ ШТРИХКОД
                    </button>
                    <button
                        type="button"
                        className="btn btn-lg w-full h-16 text-lg"
                        onClick={openJsonFromDb}
                    >
                        JSON З БАЗИ
                    </button>
                    <button
                        type="button"
                        className="btn btn-lg w-full h-16 text-lg"
                        onClick={() => {
                            setStatusMsg('');
                            leaveHub('pdf');
                        }}
                    >
                        PDF КВИТКИ
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm w-full" onClick={openImport}>
                        Імпорт JSON (файл)
                    </button>
                    {tickets.length > 0 && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm w-full"
                            onClick={() => leaveHub('checkin')}
                        >
                            Сесія генерації ({tickets.length})
                        </button>
                    )}
                </div>
            )}

            {screen === 'pdf' && (
                <Suspense
                    fallback={
                        <div className="p-8 text-center opacity-60">Завантаження PDF…</div>
                    }
                >
                    <TicketPdfExport />
                </Suspense>
            )}

            {screen === 'scan-login' && (
                <form onSubmit={handleScanLogin} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Меню штрихкодів
                    </button>
                    <h2 className="text-xl font-bold">Сканувати</h2>
                    <p className="text-sm opacity-70">Номер заходу (вже в базі)</p>
                    <input
                        type="text"
                        inputMode="text"
                        className="input input-bordered w-full font-mono"
                        placeholder="Номер / код заходу"
                        value={scanEventNo}
                        onChange={(e) => setScanEventNo(e.target.value)}
                        autoFocus
                        required
                    />
                    {statusMsg && <p className="text-sm text-error">{statusMsg}</p>}
                    <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                        {busy ? 'Завантаження…' : 'Відкрити сканер'}
                    </button>
                </form>
            )}

            {screen === 'draw-login' && (
                <form onSubmit={handleDrawLogin} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Меню штрихкодів
                    </button>
                    <h2 className="text-xl font-bold">Намалювати штрихкод</h2>
                    <p className="text-sm opacity-70">Номер заходу (вже в базі)</p>
                    <input
                        type="text"
                        inputMode="text"
                        className="input input-bordered w-full font-mono"
                        placeholder="Номер / код заходу"
                        value={scanEventNo}
                        onChange={(e) => setScanEventNo(e.target.value)}
                        autoFocus
                        required
                    />
                    {statusMsg && <p className="text-sm text-error">{statusMsg}</p>}
                    <button type="submit" className="btn btn-accent w-full" disabled={busy}>
                        {busy ? 'Завантаження…' : 'Показати штрихкоди'}
                    </button>
                </form>
            )}

            {screen === 'draw' && (
                <div className="space-y-6">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Меню штрихкодів
                    </button>
                    <div className="rounded-xl border border-base-content/10 p-4 space-y-1">
                        {eventName && <div className="font-semibold">{eventName}</div>}
                        <div className="text-xs opacity-60">Номер заходу</div>
                        <div className="font-mono text-lg font-semibold">№{eventNo}</div>
                        <div className="text-sm opacity-70">Квитків: {tickets.length}</div>
                    </div>
                    {tickets.length === 0 ? (
                        <p className="text-sm text-warning">Немає квитків для цього заходу</p>
                    ) : (
                        <div className="rounded-xl border border-base-content/10 p-4 space-y-3">
                            <h2 className="font-semibold">Штрихкод (Code128)</h2>
                            <label className="form-control w-full max-w-xs">
                                <span className="label-text text-sm opacity-70">№ квитка</span>
                                <select
                                    className="select select-bordered"
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
                </div>
            )}

            {screen === 'scan' && (
                <div
                    className={`fixed inset-0 z-40 overflow-y-auto transition-colors duration-200 ${
                        lastResult === 'ok'
                            ? 'bg-green-500 text-white'
                            : lastResult === 'reject'
                              ? 'bg-red-600 text-white'
                              : 'bg-base-100 text-base-content'
                    }`}
                >
                    <div className="max-w-xl mx-auto p-6 space-y-6 min-h-full">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={`btn btn-sm ${lastResult ? 'btn-ghost text-inherit' : 'btn-ghost'}`}
                                onClick={goHub}
                            >
                                ← Меню штрихкодів
                            </button>
                            <button
                                type="button"
                                className={`btn btn-sm ${lastResult ? 'btn-ghost text-inherit' : 'btn-ghost'}`}
                                onClick={openScanLogin}
                            >
                                Інший захід
                            </button>
                        </div>

                        <div
                            className={`rounded-xl p-4 space-y-1 ${
                                lastResult
                                    ? 'bg-black/15 border border-white/20'
                                    : 'border border-base-content/10'
                            }`}
                        >
                            {eventName && <div className="font-semibold">{eventName}</div>}
                            <div className={`text-xs ${lastResult ? 'opacity-80' : 'opacity-60'}`}>
                                Номер заходу
                            </div>
                            <div className="font-mono text-lg font-semibold">№{eventNo}</div>
                        </div>

                        {lastResult && (
                            <div className="rounded-xl bg-black/20 p-6 text-center space-y-4">
                                <div className="text-3xl font-bold tracking-wide">
                                    {lastResult === 'ok' ? 'ПРОХІД' : 'ВІДМОВА'}
                                </div>
                                <div className="text-lg font-medium opacity-95">
                                    {lastMessage}
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-lg w-full h-20 text-2xl font-bold bg-white text-base-content border-0 hover:bg-white/90"
                                    onClick={readyForNextScan}
                                >
                                    ДАЛІ
                                </button>
                            </div>
                        )}

                        {/* Камеру НЕ demount після скану — лише pause; інакше після ДАЛІ не встає */}
                        <div className={awaitingNext ? 'hidden' : 'space-y-3'}>
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="font-semibold">Сканер</h2>
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
                                    paused={scanning || awaitingNext}
                                />
                            )}
                        </div>

                        <form
                            onSubmit={handleManualScan}
                            className={awaitingNext ? 'hidden' : 'space-y-3'}
                        >
                            <label className="text-sm opacity-70">Або код вручну</label>
                            <input
                                className="input input-bordered w-full font-mono text-base-content"
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
                                {scanning ? 'Перевірка…' : 'Перевірити'}
                            </button>
                        </form>

                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div
                                className={`rounded-xl p-3 ${
                                    lastResult ? 'bg-black/15' : 'border border-base-content/10'
                                }`}
                            >
                                <div className="text-xl font-bold">{stats?.total ?? '—'}</div>
                                <div className={`text-xs ${lastResult ? 'opacity-80' : 'opacity-60'}`}>
                                    Всього
                                </div>
                            </div>
                            <div
                                className={`rounded-xl p-3 ${
                                    lastResult ? 'bg-black/15' : 'border border-base-content/10'
                                }`}
                            >
                                <div className="text-xl font-bold">{stats?.used ?? '—'}</div>
                                <div className={`text-xs ${lastResult ? 'opacity-80' : 'opacity-60'}`}>
                                    Пройшли
                                </div>
                            </div>
                            <div
                                className={`rounded-xl p-3 ${
                                    lastResult ? 'bg-black/15' : 'border border-base-content/10'
                                }`}
                            >
                                <div className="text-xl font-bold">{stats?.remaining ?? '—'}</div>
                                <div className={`text-xs ${lastResult ? 'opacity-80' : 'opacity-60'}`}>
                                    Залишилось
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {screen === 'generate' && (
                <form onSubmit={handleGenerate} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Меню штрихкодів
                    </button>
                    <p className="text-sm opacity-70">
                        Код заходу = сіль (лише на сервері). У квитку — HMAC-хеш і номер
                        квитка, не id з БД.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            className={`btn btn-sm ${!appendMode ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setAppendMode(false)}
                        >
                            Новий захід
                        </button>
                        <button
                            type="button"
                            className={`btn btn-sm ${appendMode ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setAppendMode(true)}
                        >
                            Догенерувати
                        </button>
                    </div>
                    {!appendMode && (
                        <label className="form-control w-full">
                            <span className="label-text text-sm opacity-70">Назва (опційно)</span>
                            <input
                                className="input input-bordered w-full"
                                placeholder="Назва концерту"
                                value={eventName}
                                onChange={(e) => setEventName(e.target.value)}
                            />
                        </label>
                    )}
                    <label className="form-control w-full">
                        <span className="label-text text-sm opacity-70">Номер / код заходу</span>
                        <input
                            type="text"
                            inputMode="text"
                            className="input input-bordered w-full font-mono"
                            placeholder="напр. 12 або YAS-A"
                            value={eventNo}
                            onChange={(e) => setEventNo(e.target.value)}
                            required
                        />
                    </label>
                    {!appendMode && (
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
                    )}
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
                        <span className="label-text text-sm opacity-70">
                            {appendMode ? 'Скільки додати квитків' : 'Кількість квитків'}
                        </span>
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
                    {appendMode && (
                        <p className="text-sm opacity-60">
                            Номери квитків продовжаться з наступного після останнього в БД.
                        </p>
                    )}
                    {statusMsg && <p className="text-sm text-error">{statusMsg}</p>}
                    <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                        {busy
                            ? appendMode
                                ? 'Догенерація…'
                                : 'Генерація…'
                            : appendMode
                              ? 'Додати квитки до заходу'
                              : 'Згенерувати і зберегти в БД'}
                    </button>
                </form>
            )}

            {screen === 'json-from-db' && (
                <div className="space-y-4">
                    <h2 className="text-xl font-bold">JSON з бази</h2>
                    <p className="text-sm opacity-70">
                        Номер заходу + діапазон квитків → JSON з кодами зі штрихкодами
                    </p>
                    <label className="form-control w-full">
                        <span className="label-text text-sm opacity-70">Номер заходу</span>
                        <input
                            type="text"
                            inputMode="text"
                            className="input input-bordered w-full font-mono"
                            placeholder="напр. 7"
                            value={scanEventNo}
                            onChange={(e) => setScanEventNo(e.target.value)}
                            autoFocus
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="form-control w-full">
                            <span className="label-text text-sm opacity-70">Квитки з №</span>
                            <input
                                type="number"
                                min={1}
                                className="input input-bordered w-full"
                                value={dbJsonFromNo}
                                onChange={(e) => setDbJsonFromNo(Number(e.target.value) || 1)}
                            />
                        </label>
                        <label className="form-control w-full">
                            <span className="label-text text-sm opacity-70">по №</span>
                            <input
                                type="number"
                                min={1}
                                className="input input-bordered w-full"
                                value={dbJsonToNo}
                                onChange={(e) => setDbJsonToNo(Number(e.target.value) || 1)}
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary w-full"
                        disabled={busy}
                        onClick={() => void loadJsonFromDb()}
                    >
                        {busy ? 'Завантаження…' : 'Завантажити JSON з бази'}
                    </button>
                    {dbJsonText ? (
                        <>
                            <textarea
                                className="textarea textarea-bordered w-full font-mono text-xs h-56"
                                value={dbJsonText}
                                readOnly
                            />
                            <button
                                type="button"
                                className="btn btn-outline w-full"
                                onClick={downloadDbJson}
                            >
                                Скачати .json
                            </button>
                        </>
                    ) : null}
                    {statusMsg ? (
                        <p
                            className={`text-sm ${
                                statusMsg.startsWith('Готово') ? 'text-success' : 'text-error'
                            }`}
                        >
                            {statusMsg}
                        </p>
                    ) : null}
                </div>
            )}

            {screen === 'import' && (
                <form onSubmit={handleImport} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Меню штрихкодів
                    </button>
                    <p className="text-sm opacity-70">
                        Вставте JSON з{' '}
                        <code className="text-xs">eventNo, date, accessCode, tickets</code>
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full font-mono text-xs h-48"
                        placeholder='{"eventNo":"YAS-12","date":"2026-11-15","accessCode":"YAS-x7k9m2","tickets":[{"ticketNo":1,"code":"a3f8…"}]}'
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
                            ← Меню штрихкодів
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={clearSession}>
                            Нова сесія
                        </button>
                    </div>

                    <div className="rounded-xl border border-base-content/10 p-4 space-y-1">
                        {eventName && <div className="font-semibold">{eventName}</div>}
                        <div className="text-xs opacity-60">Номер заходу</div>
                        <div className="font-mono text-lg font-semibold">№{eventNo}</div>
                        <div className="text-sm opacity-70">
                            Дата: {eventDate || '—'} · квитків: {tickets.length}
                            {tickets.length > 0
                                ? ` (№${tickets[0].ticketNo}–№${tickets[tickets.length - 1].ticketNo})`
                                : ''}
                        </div>
                        <div className="text-xs opacity-50 font-mono break-all">
                            сіль: {accessCode || '—'}
                        </div>
                        <div className="text-sm">
                            БД:{' '}
                            {persistedInDb ? (
                                <span className="text-success font-medium">
                                    збережено як захід №{eventNo}
                                </span>
                            ) : (
                                <span className="text-warning font-medium">ще не в базі</span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {!persistedInDb && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={handleSaveToDb}
                                    disabled={busy || !tickets.length}
                                >
                                    {busy ? 'Збереження…' : 'Забити у базу'}
                                </button>
                            )}
                            {persistedInDb && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                        setAppendMode(true);
                                        setScreen('generate');
                                        setStatusMsg('');
                                    }}
                                >
                                    Догенерувати квитки
                                </button>
                            )}
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
