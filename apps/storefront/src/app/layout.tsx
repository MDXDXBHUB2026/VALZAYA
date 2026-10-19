import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Valzaya',
  description: 'Natural-fabric apparel, made in numbered drops.',
};

// Locale routing (en / ar with dir="rtl") arrives in the storefront phase.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
