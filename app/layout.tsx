import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'PAI',
  description: 'Persönlicher KI-Mitarbeiter im Vertrieb',
  appleWebApp: { capable: true, title: 'PAI', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content',
  themeColor: '#F1F4F2', colorScheme: 'light',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Sans:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
