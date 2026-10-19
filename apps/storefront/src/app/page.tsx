import { formatAed } from '@valzaya/core';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Valzaya</h1>
      <p>Storefront scaffold. Drop 01 is coming soon.</p>
      <p className="text-sm opacity-70">Price formatting check: {formatAed(129_500)}</p>
    </main>
  );
}
