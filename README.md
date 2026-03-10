# QR Code Tool

A minimal browser-based tool with two features:

- **Read QR codes** — upload, drag-and-drop, or paste an image to instantly decode its QR code
- **Create QR codes** — type any text or URL to generate a QR code and download it as a PNG

Everything runs client-side. No data is sent to a server.

## Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [React 19](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [`jsqr`](https://github.com/cozmo/jsQR) — QR decoding via canvas pixel data
- [`qrcode`](https://github.com/soldair/node-qrcode) — QR code generation

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
app/
  components/
    QRApp.tsx   # Client component — all UI and logic
  layout.tsx
  page.tsx
```
