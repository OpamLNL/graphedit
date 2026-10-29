import { useEffect, useRef, useState } from 'react';
import JsBarcodeImport from 'jsbarcode';

const JsBarcode =
    (JsBarcodeImport as unknown as { default?: typeof JsBarcodeImport }).default ??
    JsBarcodeImport;

type Props = {
    value: string;
    label?: string;
    ticketNo?: number;
};

/** Картинка 1D штрихкоду Code128 — саме її читає сканер камери */
export default function TicketBarcodeImage({ value, label, ticketNo }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [dataUrl, setDataUrl] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        setError('');
        setDataUrl('');
        const canvas = canvasRef.current;
        const code = value.trim();
        if (!canvas || !code) return;

        try {
            const text =
                ticketNo != null && Number.isFinite(ticketNo)
                    ? `${ticketNo}  ${code}`
                    : code;
            // Товстіші бари + тихі зони — краще читається камерою
            JsBarcode(canvas, code, {
                format: 'CODE128',
                displayValue: true,
                text,
                fontSize: 20,
                height: 120,
                width: 2.5,
                margin: 24,
                background: '#ffffff',
                lineColor: '#000000',
            });
            setDataUrl(canvas.toDataURL('image/png'));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Помилка штрихкоду');
        }
    }, [value, ticketNo]);

    return (
        <div className="flex flex-col items-center gap-2 w-full">
            <canvas ref={canvasRef} className="hidden" />
            {error && <p className="text-sm text-error">{error}</p>}
            {!error && dataUrl && (
                <>
                    <img
                        src={dataUrl}
                        alt={label || 'Штрихкод квитка'}
                        className="w-full max-w-full rounded-lg bg-white p-4 border border-base-content/10"
                        style={{ imageRendering: 'pixelated' }}
                    />
                    {label && <div className="text-sm font-medium">{label}</div>}
                    <a
                        href={dataUrl}
                        download={`barcode-${label || 'ticket'}.png`}
                        className="btn btn-ghost btn-xs"
                    >
                        Завантажити PNG
                    </a>
                </>
            )}
            {!error && !dataUrl && (
                <div className="opacity-50 text-sm">Генерація штрихкоду…</div>
            )}
        </div>
    );
}
