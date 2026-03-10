'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';

type Tab = 'read' | 'barcode' | 'create';

const BARCODE_FORMAT_LABELS: Partial<Record<string, string>> = {
  '0': 'Aztec',
  '1': 'Codabar',
  '2': 'Code 39',
  '3': 'Code 93',
  '4': 'Code 128',
  '5': 'Data Matrix',
  '6': 'EAN-8',
  '7': 'EAN-13',
  '8': 'ITF',
  '9': 'MaxiCode',
  '10': 'PDF 417',
  '11': 'QR Code',
  '12': 'RSS 14',
  '13': 'RSS Expanded',
  '14': 'UPC-A',
  '15': 'UPC-E',
  '16': 'UPC/EAN Extension',
};

function formatLabel(format: BarcodeFormat): string {
  return BARCODE_FORMAT_LABELS[String(format)] ?? 'Unknown';
}

function isURL(text: string) {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

async function getImageFromClipboard(): Promise<File | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
    return null;
  }

  const clipboardItems = await navigator.clipboard.read();
  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;

    const blob = await item.getType(imageType);
    const extension = imageType.split('/')[1] || 'png';
    return new File([blob], `pasted-image.${extension}`, { type: imageType });
  }

  return null;
}

export default function QRApp() {
  const [tab, setTab] = useState<Tab>('read');

  // Read QR state
  const [readResult, setReadResult] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Barcode state
  const [barcodeResult, setBarcodeResult] = useState<string | null>(null);
  const [barcodeFormat, setBarcodeFormat] = useState<string | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodePreviewSrc, setBarcodePreviewSrc] = useState<string | null>(null);
  const [barcodeIsDragging, setBarcodeIsDragging] = useState(false);
  const barcodeFileInputRef = useRef<HTMLInputElement>(null);
  const barcodeImgRef = useRef<HTMLImageElement>(null);

  // Camera scan state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Create state
  const [inputText, setInputText] = useState('');
  const [qrGenerated, setQrGenerated] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── QR Read ──────────────────────────────────────────────────────────────

  const decodeFromFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setReadError('Please upload an image file.');
      setReadResult(null);
      setPreviewSrc(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      setPreviewSrc(src);
      const img = new Image();
      img.onload = () => {
        const canvas = hiddenCanvasRef.current;
        if (!canvas) return;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          setReadResult(code.data);
          setReadError(null);
        } else {
          setReadResult(null);
          setReadError('No QR code found in this image.');
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) decodeFromFile(file);
    },
    [decodeFromFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) decodeFromFile(file);
    },
    [decodeFromFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const pasteReadImage = useCallback(async () => {
    try {
      const file = await getImageFromClipboard();
      if (!file) {
        setReadResult(null);
        setReadError('No image found in your clipboard.');
        return;
      }

      decodeFromFile(file);
    } catch {
      setReadResult(null);
      setReadError('Clipboard paste is not available in this browser.');
    }
  }, [decodeFromFile]);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (tab !== 'read') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) decodeFromFile(file);
          break;
        }
      }
    },
    [tab, decodeFromFile],
  );

  // ── Barcode Read (image) ─────────────────────────────────────────────────

  const decodeBarcode = useCallback(async (src: string) => {
    setBarcodeResult(null);
    setBarcodeFormat(null);
    setBarcodeError(null);

    try {
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints);
      const img = document.createElement('img');
      img.src = src;
      await new Promise<void>((res) => {
        if (img.complete) res();
        else img.onload = () => res();
      });
      const result = await reader.decodeFromImageElement(img);
      setBarcodeResult(result.getText());
      setBarcodeFormat(formatLabel(result.getBarcodeFormat()));
      setBarcodeError(null);
    } catch {
      setBarcodeResult(null);
      setBarcodeFormat(null);
      setBarcodeError('No barcode found in this image.');
    }
  }, []);

  const decodeBarcodeFromFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setBarcodeError('Please upload an image file.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        setBarcodePreviewSrc(src);
        decodeBarcode(src);
      };
      reader.readAsDataURL(file);
    },
    [decodeBarcode],
  );

  const handleBarcodeFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) decodeBarcodeFromFile(file);
    },
    [decodeBarcodeFromFile],
  );

  const handleBarcodeDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setBarcodeIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) decodeBarcodeFromFile(file);
    },
    [decodeBarcodeFromFile],
  );

  const handleBarcodeDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setBarcodeIsDragging(true);
  }, []);

  const handleBarcodeDragLeave = useCallback(() => setBarcodeIsDragging(false), []);

  const pasteBarcodeImage = useCallback(async () => {
    try {
      const file = await getImageFromClipboard();
      if (!file) {
        setBarcodeResult(null);
        setBarcodeFormat(null);
        setBarcodeError('No image found in your clipboard.');
        return;
      }

      decodeBarcodeFromFile(file);
    } catch {
      setBarcodeResult(null);
      setBarcodeFormat(null);
      setBarcodeError('Clipboard paste is not available in this browser.');
    }
  }, [decodeBarcodeFromFile]);

  const handleBarcodePaste = useCallback(
    (e: ClipboardEvent) => {
      if (tab !== 'barcode') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) decodeBarcodeFromFile(file);
          break;
        }
      }
    },
    [tab, decodeBarcodeFromFile],
  );

  const clearBarcodeRead = useCallback(() => {
    setBarcodeResult(null);
    setBarcodeFormat(null);
    setBarcodeError(null);
    setBarcodePreviewSrc(null);
    if (barcodeFileInputRef.current) barcodeFileInputRef.current.value = '';
  }, []);

  // ── Camera scanning ──────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (cameraReaderRef.current) {
      cameraReaderRef.current.reset();
      cameraReaderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    stopCamera();
    setBarcodeResult(null);
    setBarcodeFormat(null);
    setBarcodeError(null);
    setBarcodePreviewSrc(null);

    try {
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      setCameraDevices(devices);
      const targetDeviceId = deviceId ?? devices[0]?.deviceId;
      setSelectedDeviceId(targetDeviceId);

      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 300 });
      cameraReaderRef.current = reader;

      if (!videoRef.current) return;

      const controls = await reader.decodeFromVideoDevice(
        targetDeviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            setBarcodeResult(result.getText());
            setBarcodeFormat(formatLabel(result.getBarcodeFormat()));
            setBarcodeError(null);
          } else if (err && !(err.message?.includes('No MultiFormat Readers'))) {
            // suppress normal "nothing found yet" errors
          }
        },
      );

      // Keep a reference to the stream for cleanup
      streamRef.current = (videoRef.current.srcObject as MediaStream) ?? null;

      setCameraActive(true);
      return controls;
    } catch (err) {
      setBarcodeError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera access denied. Please allow camera permissions.'
          : 'Could not access camera.',
      );
      setCameraActive(false);
    }
  }, [stopCamera]);

  // ── Shared paste listener ────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      handlePaste(e);
      handleBarcodePaste(e);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [handlePaste, handleBarcodePaste]);

  // ── QR Create ────────────────────────────────────────────────────────────

  const generateQR = useCallback(async () => {
    if (!inputText.trim()) return;
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    try {
      await QRCode.toCanvas(canvas, inputText.trim(), {
        width: 280,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrGenerated(true);
    } catch {
      setQrGenerated(false);
    }
  }, [inputText]);

  const downloadQR = useCallback(() => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'qrcode.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const clearRead = useCallback(() => {
    setReadResult(null);
    setReadError(null);
    setPreviewSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const openReadFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openBarcodeFilePicker = useCallback(() => {
    barcodeFileInputRef.current?.click();
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            QR &amp; Barcode Tool
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Read barcodes, read QR codes, or create QR codes — all in your browser
          </p>
          <p className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 px-4 py-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
            Privacy notice: all data is processed entirely client-side in your browser. Nothing is
            sent to any server.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-900 p-1 mb-8">
          {(['read', 'barcode', 'create'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                if (t !== 'barcode') stopCamera();
                setTab(t);
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                tab === t
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {t === 'read' ? 'Read QR' : t === 'barcode' ? 'Scan Barcode' : 'Create QR'}
            </button>
          ))}
        </div>

        {/* ── Read QR panel ── */}
        {tab === 'read' && (
          <div className="flex flex-col gap-5">
            <canvas ref={hiddenCanvasRef} className="hidden" />

            <div
              onClick={openReadFilePicker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openReadFilePicker();
                }
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="button"
              tabIndex={0}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-colors select-none min-h-52 ${
                isDragging
                  ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-900'
              }`}
            >
              {previewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewSrc}
                  alt="Uploaded QR"
                  className="max-h-44 max-w-full rounded-lg object-contain"
                />
              ) : (
                <>
                  <UploadIcon />
                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    Drop image here, upload it, or paste it
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">PNG, JPG, WEBP, GIF…</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      pasteReadImage();
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Paste image
                  </button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {readResult && (
              <ResultCard
                label="Decoded QR"
                value={readResult}
                onCopy={() => navigator.clipboard.writeText(readResult)}
              />
            )}

            {readError && <ErrorCard message={readError} />}

            {previewSrc && (
              <button
                onClick={clearRead}
                className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Clear and try another image
              </button>
            )}
          </div>
        )}

        {/* ── Scan Barcode panel ── */}
        {tab === 'barcode' && (
          <div className="flex flex-col gap-5">
            {/* Mode toggle */}
            <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-900 p-1">
              <button
                onClick={() => { stopCamera(); clearBarcodeRead(); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  !cameraActive
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                Upload Image
              </button>
              <button
                onClick={() => startCamera(selectedDeviceId)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  cameraActive
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                Use Camera
              </button>
            </div>

            {/* Camera view */}
            {cameraActive && (
              <div className="flex flex-col gap-3">
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                  />
                  {/* Scan line animation */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3/4 h-px bg-red-500 opacity-70 animate-pulse" />
                  </div>
                  {/* Overlay corners */}
                  <div className="absolute inset-4 border-2 border-white/30 rounded-xl pointer-events-none" />
                </div>

                {/* Camera selector */}
                {cameraDevices.length > 1 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      startCamera(e.target.value);
                    }}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-50 outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                  >
                    {cameraDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${cameraDevices.indexOf(d) + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={stopCamera}
                  className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                  Stop camera
                </button>
              </div>
            )}

            {/* Image upload (when camera not active) */}
            {!cameraActive && (
              <div
                onClick={openBarcodeFilePicker}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openBarcodeFilePicker();
                  }
                }}
                onDrop={handleBarcodeDrop}
                onDragOver={handleBarcodeDragOver}
                onDragLeave={handleBarcodeDragLeave}
                role="button"
                tabIndex={0}
                className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-colors select-none min-h-52 ${
                  barcodeIsDragging
                    ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                    : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-900'
                }`}
              >
                {barcodePreviewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    ref={barcodeImgRef}
                    src={barcodePreviewSrc}
                    alt="Uploaded barcode"
                    className="max-h-44 max-w-full rounded-lg object-contain"
                  />
                ) : (
                  <>
                    <BarcodeIcon />
                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                      Drop barcode image here, upload it, or paste it
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      Code 128, EAN, UPC, QR, PDF417, Data Matrix…
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pasteBarcodeImage();
                      }}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Paste image
                    </button>
                  </>
                )}
                <input
                  ref={barcodeFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBarcodeFileChange}
                />
              </div>
            )}

            {/* Result */}
            {barcodeResult && (
              <ResultCard
                label={barcodeFormat ? `Decoded · ${barcodeFormat}` : 'Decoded'}
                value={barcodeResult}
                onCopy={() => navigator.clipboard.writeText(barcodeResult)}
              />
            )}

            {barcodeError && <ErrorCard message={barcodeError} />}

            {barcodePreviewSrc && !cameraActive && (
              <button
                onClick={clearBarcodeRead}
                className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                Clear and try another image
              </button>
            )}
          </div>
        )}

        {/* ── Create QR panel ── */}
        {tab === 'create' && (
          <div className="flex flex-col gap-5">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  setQrGenerated(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && generateQR()}
                placeholder="Enter text or URL…"
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition"
              />
              <button
                onClick={generateQR}
                disabled={!inputText.trim()}
                className="px-5 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-40 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
              >
                Generate
              </button>
            </div>

            <div
              className={`flex flex-col items-center gap-5 rounded-2xl border bg-white dark:bg-zinc-900 p-8 transition-all ${
                qrGenerated
                  ? 'border-zinc-200 dark:border-zinc-700'
                  : 'border-dashed border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {qrGenerated ? (
                <>
                  <canvas ref={qrCanvasRef} className="rounded-lg shadow-sm" />
                  <button
                    onClick={downloadQR}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <DownloadIcon />
                    Download PNG
                  </button>
                </>
              ) : (
                <>
                  <canvas ref={qrCanvasRef} className="hidden" />
                  <div className="flex flex-col items-center gap-2 py-6">
                    <QRPlaceholderIcon />
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                      Your QR code will appear here
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function ResultCard({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 mb-1">
            {label}
          </p>
          {isURL(value) ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-green-700 dark:text-green-300 break-all underline underline-offset-2"
            >
              {value}
            </a>
          ) : (
            <p className="text-sm font-medium text-green-700 dark:text-green-300 break-all">
              {value}
            </p>
          )}
        </div>
        <button
          onClick={onCopy}
          title="Copy to clipboard"
          className="shrink-0 p-1.5 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
        >
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
      <p className="text-sm font-medium text-red-600 dark:text-red-400">{message}</p>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-400 dark:text-zinc-500"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-400 dark:text-zinc-500"
    >
      <path d="M3 5v14" />
      <path d="M7 5v14" />
      <path d="M10 5v14" />
      <path d="M13 5v14" />
      <path d="M17 5v14" />
      <path d="M21 5v14" />
      <path d="M3 5h1" />
      <path d="M3 19h1" />
      <path d="M20 5h1" />
      <path d="M20 19h1" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function QRPlaceholderIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-300 dark:text-zinc-600"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none" />
      <line x1="14" y1="14" x2="14" y2="14" strokeWidth="3" />
      <line x1="17" y1="14" x2="17" y2="14" strokeWidth="3" />
      <line x1="20" y1="14" x2="20" y2="14" strokeWidth="3" />
      <line x1="14" y1="17" x2="14" y2="17" strokeWidth="3" />
      <line x1="17" y1="17" x2="20" y2="17" strokeWidth="3" />
      <line x1="20" y1="20" x2="20" y2="20" strokeWidth="3" />
      <line x1="14" y1="20" x2="17" y2="20" strokeWidth="3" />
    </svg>
  );
}
