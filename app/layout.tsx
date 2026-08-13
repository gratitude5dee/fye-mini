import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'living-grimoire.sites.openai.com';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  const origin = `${protocol}://${host}`;
  const title = 'The Living Grimoire';
  const description = 'Cast elemental magic. Bind what you conjure into a spellbook the world can cast from.';
  return {
    title,
    description,
    icons: { icon: '/favicon.svg' },
    openGraph: { title, description, url: origin, siteName: title, images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: 'The Living Grimoire' }] },
    twitter: { card: 'summary_large_image', title, description, images: [`${origin}/og.png`] }
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
