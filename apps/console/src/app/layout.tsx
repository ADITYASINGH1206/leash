import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Leash: a payment firewall for AI agents',
    template: '%s | Leash',
  },
  description:
    'Leash sits between AI agents and PayPal. Every payment must trace back to a mandate you signed, pass five checks, and is captured only when the merchant ships.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Leash Approvals',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#E8EBE3',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="paper-fibre min-h-screen bg-paper text-ink">{children}</body>
    </html>
  );
}
