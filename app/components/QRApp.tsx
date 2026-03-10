'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

type Tab = 'read' | 'create';

function isURL(text: string) {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

export default function QRApp() {
  const [tab, setTab] = useState<Tab>('read');

  // Read state
  const [readResult, setReadResult] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create state
  const [inputText, setInputText] = useState('');
  const [qrGenerated, setQrGenerated] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            QR Code Tool
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Read or create QR codes instantly in your browser
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-900 p-1 mb-8">
          {(['read', 'create'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                tab === t
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {t === 'read' ? 'Read QR Code' : 'Create QR Code'}
            </button>
          ))}
        </div>

        {/* Read panel */}
        {tab === 'read' && (
          <div className="flex flex-col gap-5">
            <canvas ref={hiddenCanvasRef} className="hidden" />

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
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
                    Drop image here, click to browse, or paste
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    PNG, JPG, WEBP, GIF…
                  </p>
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

            {/* Result */}
            {readResult && (
              <div className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 mb-1">
                      Decoded
                    </p>
                    {isURL(readResult) ? (
                      <a
                        href={readResult}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-green-700 dark:text-green-300 break-all underline underline-offset-2"
                      >
                        {readResult}
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-green-700 dark:text-green-300 break-all">
                        {readResult}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(readResult)}
                    title="Copy to clipboard"
                    className="shrink-0 p-1.5 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
            )}

            {readError && (
              <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {readError}
                </p>
              </div>
            )}

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

        {/* Create panel */}
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
                  <canvas
                    ref={qrCanvasRef}
                    className="rounded-lg shadow-sm"
                  />
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
