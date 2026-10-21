import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

type Screen = 'hub' | 'generate' | 'import' | 'checkin';

function makeEventSalt(): string {
    const n = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `EVT-${n}`;
}

/** Тимчасова генерація payload штрихкоду: номер квитка + сіль концерту */
function buildBarcode(ticketNo: number, eventSalt: string): string {
    return `${eventSalt}-${String(ticketNo).padStart(4, '0')}`;
}

export default function TicketCheckinPage() {
    const { user, role } = useAuth();
    const navigate = useNavigate();

    const [screen, setScreen] = useState<Screen>('hub');
    const [eventSalt, setEventSalt] = useState('');
    const [eventName, setEventName] = useState('');
    const [ticketCount, setTicketCount] = useState(50);
    const [importText, setImportText] = useState('');
    const [tickets, setTickets] = useState<{ ticketNo: number; barcode: string }[]>([]);
    const [statusMsg, setStatusMsg] = useState('');

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
        setEventSalt(makeEventSalt());
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

    const handleGenerate = (e: React.FormEvent) => {
        e.preventDefault();
        const salt = eventSalt.trim();
        const count = Number(ticketCount);
        if (!salt || !count || count < 1 || count > 5000) {
            setStatusMsg('Вкажіть сіль концерту і кількість квитків (1–5000).');
            return;
        }
        const generated = Array.from({ length: count }, (_, i) => {
            const ticketNo = i + 1;
            return { ticketNo, barcode: buildBarcode(ticketNo, salt) };
        });
        setTickets(generated);
        setStatusMsg(`Згенеровано ${count} кодів для «${eventName.trim() || salt}».`);
        // API / JSON-експорт / PDF підключимо пізніше
        setScreen('checkin');
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
                    return { ticketNo: idx + 1, barcode: item };
                }
                if (item && typeof item === 'object') {
                    const o = item as { ticketNo?: number; barcode?: string; code?: string };
                    const barcode = o.barcode || o.code;
                    if (!barcode) throw new Error(`Немає barcode у елементі #${idx + 1}`);
                    return { ticketNo: o.ticketNo ?? idx + 1, barcode: String(barcode) };
                }
                throw new Error(`Невірний формат елемента #${idx + 1}`);
            });
            const saltFromJson =
                !Array.isArray(raw) && raw && typeof raw === 'object'
                    ? String((raw as { eventSalt?: string; accessCode?: string }).eventSalt ||
                          (raw as { accessCode?: string }).accessCode ||
                          '')
                    : '';
            setEventSalt(saltFromJson || makeEventSalt());
            setEventName(
                !Array.isArray(raw) && raw && typeof raw === 'object'
                    ? String((raw as { eventName?: string; name?: string }).eventName ||
                          (raw as { name?: string }).name ||
                          '')
                    : '',
            );
            setTickets(parsed);
            setStatusMsg(`Імпортовано ${parsed.length} кодів.`);
            setScreen('checkin');
        } catch (err) {
            setStatusMsg(err instanceof Error ? err.message : 'Помилка розбору JSON');
        }
    };

    const downloadJson = () => {
        if (!tickets.length) return;
        const payload = {
            eventName: eventName || undefined,
            eventSalt,
            tickets: tickets.map((t) => ({ ticketNo: t.ticketNo, barcode: t.barcode })),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tickets-${eventSalt || 'export'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleScanStub = (e: React.FormEvent) => {
        e.preventDefault();
        const code = manualCode.trim();
        if (!code) return;
        const known = tickets.find((t) => t.barcode === code);
        if (!known) {
            setLastResult('reject');
            setLastMessage('Код невідомий (немає в списку)');
        } else {
            setLastResult('ok');
            setLastMessage(`Квиток №${known.ticketNo} — ок (ще без збереження в БД)`);
        }
        setManualCode('');
    };

    if (role !== 'admin') {
        return <div className="p-8 text-center opacity-60">Завантаження...</div>;
    }

    return (
        <div className="max-w-xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <h1 className="text-2xl font-bold">Квитки / штрихкоди</h1>
                <Link to="/admin/adminPage" className="btn btn-ghost btn-sm">
                    ← Адмінка
                </Link>
            </div>

            {screen === 'hub' && (
                <div className="space-y-4">
                    <p className="text-sm opacity-70">
                        Спочатку створіть або імпортуйте штрихкоди. Код концерту зʼявиться після
                        генерації.
                    </p>
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
                        Сіль концерту потрапить у кожен штрихкод разом із номером квитка.
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
                        <span className="label-text text-sm opacity-70">Сіль / код концерту</span>
                        <input
                            className="input input-bordered w-full font-mono"
                            value={eventSalt}
                            onChange={(e) => setEventSalt(e.target.value)}
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
                    <button type="submit" className="btn btn-primary w-full">
                        Згенерувати
                    </button>
                </form>
            )}

            {screen === 'import' && (
                <form onSubmit={handleImport} className="space-y-4">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={goHub}>
                        ← Назад
                    </button>
                    <p className="text-sm opacity-70">
                        Вставте JSON: масив кодів або{' '}
                        <code className="text-xs">{`{ eventSalt, tickets: [{ ticketNo, barcode }] }`}</code>
                    </p>
                    <textarea
                        className="textarea textarea-bordered w-full font-mono text-xs h-48"
                        placeholder='{"eventSalt":"EVT-ABC","tickets":[{"ticketNo":1,"barcode":"EVT-ABC-0001"}]}'
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
                        <div className="text-xs opacity-60">Код / сіль концерту</div>
                        <div className="font-mono text-lg font-semibold">{eventSalt}</div>
                        <div className="text-sm opacity-70">Квитків у списку: {tickets.length}</div>
                        <button type="button" className="btn btn-outline btn-sm mt-2" onClick={downloadJson}>
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
