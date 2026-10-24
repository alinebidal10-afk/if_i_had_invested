import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'] });

// Link previews need an absolute origin: set NEXT_PUBLIC_SITE_URL once deployed.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3011'),
  title: 'If I had invested',
  description: 'Pick an amount, a date and an asset. Watch what it would be worth now, live.',
  // The homepage preview: the blank sentence. A comparison link replaces all of this with its own.
  openGraph: {
    type: 'website',
    siteName: 'If I had invested',
    title: 'If I had invested',
    description: 'Pick an amount, a date and an asset. Watch what it would be worth now, live.',
    images: [{ url: '/api/og', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title: 'If I had invested', description: 'Pick an amount, a date and an asset. Watch what it would be worth now, live.', images: ['/api/og'] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.className}>
      <body>{children}</body>
    </html>
  );
}
