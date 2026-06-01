import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Çalışkan Çanta — Satış Paneli',
  description: 'Satış Yönetim Paneli',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    shortcut: '/favicon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E85D04" />
      </head>
      <body>{children}</body>
    </html>
  );
}
