import { useEffect, useRef, useState } from 'react';
import {
    Html5Qrcode,
    Html5QrcodeSupportedFormats,
    type Html5QrcodeCameraScanConfig,
} from 'html5-qrcode';

type Props = {
    onScan: (code: string) => void;
    paused?: boolean;
};

const REGION_ID = 'tix-barcode-reader';

/** Сканер 1D штрихкодів (Code128 тощо) з камери */
export default function BarcodeScanner({ onScan, paused }: Props) {
    const onScanRef = useRef(onScan);
    const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
    const [error, setError] = useState('');
    const [running, setRunning] = useState(false);

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        if (paused) return;

        let scanner: Html5Qrcode | null = null;
        let cancelled = false;

        const start = async () => {
            setError('');
            try {
                scanner = new Html5Qrcode(REGION_ID, {
                    formatsToSupport: [
                        Html5QrcodeSupportedFormats.CODE_128,
                        Html5QrcodeSupportedFormats.CODE_39,
                        Html5QrcodeSupportedFormats.EAN_13,
                        Html5QrcodeSupportedFormats.EAN_8,
                        Html5QrcodeSupportedFormats.UPC_A,
                        Html5QrcodeSupportedFormats.UPC_E,
                    ],
                    verbose: false,
                });

                const config: Html5QrcodeCameraScanConfig = {
                    fps: 10,
                    qrbox: { width: 320, height: 140 },
                    aspectRatio: 1.777,
                };

                await scanner.start(
                    { facingMode: 'environment' },
                    config,
                    (decoded) => {
                        const code = decoded.trim();
                        if (!code) return;
                        const now = Date.now();
                        const last = lastCodeRef.current;
                        if (last && last.code === code && now - last.at < 2500) return;
                        lastCodeRef.current = { code, at: now };
                        onScanRef.current(code);
                    },
                    () => undefined,
                );

                if (cancelled) {
                    await scanner.stop().catch(() => undefined);
                    return;
                }
                setRunning(true);
            } catch (err) {
                setRunning(false);
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Не вдалося відкрити камеру. Дозволь доступ або введи код вручну.',
                );
            }
        };

        void start();

        return () => {
            cancelled = true;
            setRunning(false);
            if (scanner?.isScanning) {
                void scanner.stop().catch(() => undefined);
            }
        };
    }, [paused]);

    return (
        <div className="space-y-2">
            <div
                id={REGION_ID}
                className="overflow-hidden rounded-xl border border-base-content/15 bg-base-200 min-h-[200px]"
            />
            {running && (
                <p className="text-xs text-center opacity-60">
                    Наведи камеру на штрихкод (Code128)
                </p>
            )}
            {error && <p className="text-sm text-error text-center">{error}</p>}
        </div>
    );
}
