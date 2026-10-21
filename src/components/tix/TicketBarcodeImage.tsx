import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

type Props = {
    value: string;
    label?: string;
};

/** Картинка 1D штрихкоду Code128 — саме її читає сканер камери */
export default function TicketBarcodeImage({ value, label }: Props) {
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
            // Товстіші бари + тихі зони — інакше камера не читає довгі HMAC (24 hex)
            JsBarcode(canvas, code, {
                format: 'CODE128',
                displayValue: true,
                fontSize: 16,
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
    }, [value]);

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
