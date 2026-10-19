import { ORDER_STATUSES } from '@valzaya/core';

export default function ManagerHome() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Valzaya Manager</h1>
      <p>Manager portal scaffold. Staff sign-in (owner / ops) arrives in a later phase.</p>
      <p className="text-sm opacity-70">Order statuses wired from core: {ORDER_STATUSES.length}</p>
    </main>
  );
}
