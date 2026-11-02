import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leash · Payment Firewall for AI Agents',
  description:
    'Institutional-grade payment firewall sitting between autonomous AI shopping agents and PayPal · PayPal AI Hackathon 2026',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Leash Approvals',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground min-h-screen antialiased selection:bg-emerald-light/20 selection:text-emerald-light blueprint-grid">
        {children}
      </body>
    </html>
  );
}
