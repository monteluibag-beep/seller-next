import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Çalışkan Çanta — Satış Paneli',
  description: 'Satış Yönetim Paneli',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
