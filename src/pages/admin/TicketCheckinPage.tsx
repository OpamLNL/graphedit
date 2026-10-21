import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/client';
import { tixApi, type TixGeneratedCodes } from '../../api/tix';

type Screen = 'hub' | 'generate' | 'import' | 'checkin';

function todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export default function TicketCheckinPage() {
    const { user, role } = useAuth();
    const navigate = useNavigate();

    const [screen, setScreen] = useState<Screen>('hub');
    const [eventNo, setEventNo] = useState(1);
    const [eventDate, setEventDate] = useState(todayIso());
    const [eventName, setEventName] = useState('');
    const [ticketCount, setTicketCount] = useState(50);
    const [importText, setImportText] = useState('');
    const [accessCode, setAccessCode] = useState('');
    const [tickets, setTickets] = useState<{ ticketNo: number; code: string }[]>([]);
    const [generatedJson, setGeneratedJson] = useState<TixGeneratedCodes | null>(null);
    const [statusMsg, setStatusMsg] = useState('');
    const [busy, setBusy] = useState(false);

    const [manualCode, setManualCode] = useState('');
    const [lastResult, setLastResult] = useState<'ok' | 'reject' | null>(null);
    const [lastMessage, setLastMessage] = useState('');

    useEffect(() => {
        if (!user) return navigate('/');
        if (role !== 'admin') return navigate('/');
    }, [user, role, navigate]);

    const goHub = () => {
        setScreen('hub');
        setStatusMsg('');
        setLastResult(null);
        setLastMessage('');
    };

    const openGenerate = () => {
        setEventNo(1);
        setEventDate(todayIso());
        setEventName('');
        setTicketCount(50);
        setStatusMsg('');
        setScreen('generate');
    };

    const openImport = () => {
        setImportText('');
        setStatusMsg('');
        setScreen('import');
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!eventNo || eventNo < 1 || !eventDate || !ticketCount) {
            setStatusMsg('Вкажіть номер заходу, дату і кількість квитків.');
            return;
        }
        setBusy(true);
        setStatusMsg('');
        try {
            const result = await tixApi.generateCodes({
                eventNo: Number(eventNo),
                date: eventDate,
                ticketCount: Number(ticketCount),
                name: eventName.trim() || undefined,
                persist: true,
            });
            setGeneratedJson(result);
            setAccessCode(result.accessCode);
            setEventName(result.name);
            setTickets(result.tickets);
            setStatusMsg(`Згенеровано ${result.tickets.length} кодів (${result.accessCode}).`);
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
            setAccessCode(codeFromJson);
            setEventName(
                !Array.isArray(raw) && raw && typeof raw === 'object'
                    ? String(
                          (raw as { name?: string }).name ||
                              (raw as { eventName?: string }).eventName ||
                              '',
                      )
                    : '',
            );
            setTickets(parsed);
            setGeneratedJson({
                eventNo: Number((raw as { eventNo?: number }).eventNo) || 0,
                date: String((raw as { date?: string }).date || ''),
                accessCode: codeFromJson,
                name: eventName,
                persisted: false,
                tickets: parsed,
            });
            setStatusMsg(`Імпортовано ${parsed.length} кодів.`);
            setScreen('checkin');
        } catch (err) {
            setStatusMsg(err instanceof Error ? err.message : 'Помилка розбору JSON');
        }
    };

    const downloadJson = () => {
        if (!tickets.length) return;
        const payload =
            generatedJson ??
            ({
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

    const handleScanStub = (e: React.FormEvent) => {
        e.preventDefault();
        const code = manualCode.trim();
        if (!code) return;
        const known = tickets.find((t) => t.code === code);
        if (!known) {
            setLastResult('reject');
            setLastMessage('Код невідомий (немає в списку)');
        } else {
            setLastResult('ok');
            setLastMessage(`Квиток №${known.ticketNo} — ок`);
        }
        setManualCode('');
    };

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
                    <div className="rounded-xl bg-primary/10 border border-primary/30 p-4">
                        <p className="text-sm font-medium">
                            Крок 1: згенеруй або імпортуй штрихкоди. Сканер відкриється після
                            цього.
                        </p>
                    </div>
                    <button type="button" className="btn btn-primary w-full" onClick={openGenerate}>
                        Згенерувати штрихкоди
                    </button>
                    <button type="button" className="btn btn-outline w-full" onClick={openImport}>
                        Імпорт з JSON
                    </button>
                </div>
            )}

            {screen === 'generate' && (
                <form onSubmit={handleGenerate} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Назад
                    </button>
                    <p className="text-sm opacity-70">
                        Номер заходу + дата → JSON кодів ({`{ ticketNo, code }`}) і запис у БД.
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
                        Вставте JSON з полями{' '}
                        <code className="text-xs">{`tickets: [{ ticketNo, code }]`}</code>
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full font-mono text-xs h-48"
                        placeholder='{"eventNo":12,"date":"2026-11-15","accessCode":"E12-20261115","tickets":[{"ticketNo":1,"code":"E12-20261115-0001"}]}'
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        required
                    />
                    {statusMsg && <p className="text-sm text-error">{statusMsg}</p>}
                    <button type="submit" className="btn btn-primary w-full">
                        Імпортувати
                    </button>
                </form>
            )}

            {screen === 'checkin' && (
                <div className="space-y-6">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← На початок
                    </button>

                    <div className="rounded-xl border border-base-content/10 p-4 space-y-1">
                        {eventName && <div className="font-semibold">{eventName}</div>}
                        <div className="text-xs opacity-60">Код заходу (accessCode)</div>
                        <div className="font-mono text-lg font-semibold">{accessCode || '—'}</div>
                        <div className="text-sm opacity-70">Квитків: {tickets.length}</div>
                        <button
                            type="button"
                            className="btn btn-outline btn-sm mt-2"
                            onClick={downloadJson}
                        >
                            Завантажити JSON
                        </button>
                    </div>

                    {statusMsg && <p className="text-sm opacity-70">{statusMsg}</p>}

                    <div className="rounded-xl border border-dashed border-base-content/20 p-8 text-center opacity-60">
                        Тут буде камера / сканер QR
                    </div>

                    <form onSubmit={handleScanStub} className="space-y-3">
                        <label className="text-sm opacity-70">Або введіть код вручну</label>
                        <input
                            className="input input-bordered w-full font-mono"
                            placeholder="Штрихкод / QR"
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary w-full">
                            Перевірити
                        </button>
                    </form>

                    {lastResult && (
                        <div
                            className={`rounded-xl p-4 text-center font-semibold ${
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
                            <div className="text-xl font-bold">{tickets.length || '—'}</div>
                            <div className="text-xs opacity-60">Всього</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">—</div>
                            <div className="text-xs opacity-60">Пройшли</div>
                        </div>
                        <div className="rounded-xl border border-base-content/10 p-3">
                            <div className="text-xl font-bold">—</div>
                            <div className="text-xs opacity-60">Залишилось</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
