import type { Metadata } from 'next';
import './globals.css';

const title = 'Living Grimoire';
const description = 'A local-first elemental casting stage with a visible 3D caster and on-device hand tracking.';

export const metadata: Metadata = {
  title,
  description,
  icons: { icon: '/favicon.svg' },
  openGraph: { title, description, siteName: title, images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Living Grimoire casting stage' }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
