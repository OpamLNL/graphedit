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
            JsBarcode(canvas, code, {
                format: 'CODE128',
                displayValue: true,
                fontSize: 14,
                height: 80,
                margin: 10,
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
                        className="w-full max-w-md rounded-lg bg-white p-3 border border-base-content/10"
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
