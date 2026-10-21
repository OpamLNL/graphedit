import { useEffect, useId, useRef, useState } from 'react';
import {
    Html5Qrcode,
    Html5QrcodeSupportedFormats,
    type Html5QrcodeCameraScanConfig,
} from 'html5-qrcode';

type Props = {
    onScan: (code: string) => void;
    /** Не зупиняє камеру — лише ігнорує детекції */
    paused?: boolean;
};

type BarcodeDetectorLike = {
    detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
    const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
    return w.BarcodeDetector ?? null;
}

/** Черга stop→start між монтуваннями (інакше камера «залипає» після ДАЛІ) */
let cameraChain: Promise<void> = Promise.resolve();

function enqueueCamera<T>(fn: () => Promise<T>): Promise<T> {
    const run = cameraChain.then(fn, fn);
    cameraChain = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

/** Сканер 1D (Code128): html5 першим, native — запасний */
export default function BarcodeScanner({ onScan, paused }: Props) {
    const reactId = useId().replace(/:/g, '');
    const hostId = `tix-barcode-host-${reactId}`;
    const regionId = `tix-barcode-reader-${reactId}`;

    const onScanRef = useRef(onScan);
    const pausedRef = useRef(!!paused);
    const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState('');
    const [engine, setEngine] = useState<'native' | 'html5' | ''>('');

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        pausedRef.current = !!paused;
    }, [paused]);

    const emit = (raw: string) => {
        if (pausedRef.current) return;
        const code = raw.trim();
        if (!code) return;
        const now = Date.now();
        const last = lastCodeRef.current;
        if (last && last.code === code && now - last.at < 2000) return;
        lastCodeRef.current = { code, at: now };
        onScanRef.current(code);
    };

    useEffect(() => {
        let cancelled = false;
        let stream: MediaStream | null = null;
        let raf = 0;
        let scanner: Html5Qrcode | null = null;

        const startHtml5 = async () => {
            const host = document.getElementById(hostId);
            if (!host) throw new Error('Немає контейнера сканера');

            host.innerHTML = '';
            const region = document.createElement('div');
            region.id = regionId;
            host.appendChild(region);

            scanner = new Html5Qrcode(regionId, {
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                ],
                verbose: false,
                useBarCodeDetectorIfSupported: false,
            });

            const config: Html5QrcodeCameraScanConfig = {
                fps: 15,
                qrbox: (viewW, viewH) => ({
                    width: Math.floor(Math.min(viewW * 0.98, viewW - 4)),
                    height: Math.floor(Math.min(viewH * 0.55, 280)),
                }),
                disableFlip: false,
                aspectRatio: 1.777,
                videoConstraints: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                } as MediaTrackConstraints,
            };

            await scanner.start(
                { facingMode: 'environment' },
                config,
                (decoded) => emit(decoded),
                () => undefined,
            );
            if (cancelled) {
                await scanner.stop().catch(() => undefined);
                return;
            }
            setEngine('html5');
            setError('');
        };

        const startNative = async (): Promise<boolean> => {
            const Ctor = getBarcodeDetector();
            if (!Ctor || !videoRef.current) return false;

            let detector: BarcodeDetectorLike;
            try {
                detector = new Ctor({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8'] });
            } catch {
                try {
                    detector = new Ctor();
                } catch {
                    return false;
                }
            }

            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                },
            });
            if (cancelled) {
                stream.getTracks().forEach((t) => t.stop());
                return false;
            }

            const video = videoRef.current;
            video.srcObject = stream;
            await video.play();
            setEngine('native');
            setError('');

            const loop = async () => {
                if (cancelled) return;
                try {
                    if (
                        !pausedRef.current &&
                        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
                    ) {
                        const codes = await detector.detect(video);
                        for (const c of codes) {
                            if (c.rawValue) {
                                emit(c.rawValue);
                                break;
                            }
                        }
                    }
                } catch {
                    /* frame skip */
                }
                raf = window.setTimeout(() => {
                    void loop();
                }, 120);
            };
            void loop();
            return true;
        };

        const stopAll = async () => {
            if (raf) {
                window.clearTimeout(raf);
                raf = 0;
            }
            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
                stream = null;
            }
            if (videoRef.current) videoRef.current.srcObject = null;
            if (scanner) {
                try {
                    if (scanner.isScanning) await scanner.stop();
                } catch {
                    /* ignore */
                }
                try {
                    scanner.clear();
                } catch {
                    /* ignore */
                }
                scanner = null;
            }
            const host = document.getElementById(hostId);
            if (host) host.innerHTML = '';
            setEngine('');
        };

        void enqueueCamera(async () => {
            if (cancelled) return;
            setError('');
            try {
                await startHtml5();
                if (!cancelled) return;
            } catch {
                /* fallback native */
            }
            if (cancelled) {
                await stopAll();
                return;
            }
            try {
                if (scanner) {
                    try {
                        if (scanner.isScanning) await scanner.stop();
                    } catch {
                        /* ignore */
                    }
                    scanner = null;
                }
                const host = document.getElementById(hostId);
                if (host) host.innerHTML = '';
                const ok = await startNative();
                if (cancelled) {
                    await stopAll();
                    return;
                }
                if (ok) return;
                throw new Error('Камера недоступна');
            } catch (err) {
                await stopAll();
                if (cancelled) return;
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Не вдалося відкрити камеру. Дозволь доступ або введи код вручну.',
                );
            }
        });

        return () => {
            cancelled = true;
            void enqueueCamera(() => stopAll());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; paused via ref
    }, [hostId, regionId]);

    return (
        <div className="space-y-2">
            <div className="relative overflow-hidden rounded-xl border border-base-content/15 bg-base-200 min-h-[240px]">
                <video
                    ref={videoRef}
                    className={engine === 'native' ? 'w-full h-auto min-h-[240px] object-cover' : 'hidden'}
                    muted
                    playsInline
                    autoPlay
                />
                <div
                    id={hostId}
                    className={engine === 'html5' || !engine ? 'w-full min-h-[240px]' : 'hidden'}
                />
                {paused && engine && (
                    <div className="absolute inset-0 bg-base-300/50 flex items-center justify-center text-sm font-medium">
                        Перевірка…
                    </div>
                )}
            </div>
            {engine && !error && (
                <p className="text-xs text-center opacity-60">
                    Тримайте штрихкод горизонтально, на весь кадр (Code128)
                </p>
            )}
            {error && <p className="text-sm text-error text-center">{error}</p>}
        </div>
    );
}
