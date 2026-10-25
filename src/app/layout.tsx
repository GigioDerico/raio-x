import type { Metadata, Viewport } from 'next';
// Fonte servida pelo próprio app (pacote npm), não pelo Google: nada de
// requisição a terceiro em cada carregamento.
import '@fontsource/familjen-grotesk/400.css';
import '@fontsource/familjen-grotesk/500.css';
import '@fontsource/familjen-grotesk/600.css';
import '@fontsource/familjen-grotesk/400-italic.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Raio-X',
    template: '%s · Raio-X',
  },
  description: 'Painel pessoal de finanças — Open Finance e faturas em PDF no mesmo lugar.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#0b100e' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
