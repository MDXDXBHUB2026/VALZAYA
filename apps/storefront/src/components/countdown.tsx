'use client';

import { useSyncExternalStore } from 'react';
import type { Dictionary } from '@/i18n/dictionaries/en';

interface Props {
  target: string;
  /** Formatted on the server so server and browser render identical text. */
  dateLabel: string;
  locale: 'en' | 'ar';
  t: Dictionary['countdown'];
}

// A one-second clock shared by all countdowns. Server and hydration render `null` (no ticking
// numbers), so there is never a server/client text mismatch.
let clock: number | null = null;
function subscribeClock(onChange: () => void) {
  clock = Date.now();
  onChange();
  const timer = setInterval(() => {
    clock = Date.now();
    onChange();
  }, 1_000);
  return () => clearInterval(timer);
}
const readClock = () => clock;

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86_400),
    hours: Math.floor((s % 86_400) / 3_600),
    minutes: Math.floor((s % 3_600) / 60),
    seconds: s % 60,
  };
}

/**
 * Live countdown. The server renders only the fixed date (no hydration mismatch, works without
 * JS); the ticking numbers appear after mount and are hidden from screen readers, which get the
 * static date instead of a once-a-second announcement.
 */
export function Countdown({ target, dateLabel, locale, t }: Props) {
  const targetMs = Date.parse(target);
  const now = useSyncExternalStore(subscribeClock, readClock, () => null);

  const nf = new Intl.NumberFormat(`${locale}-AE`, { minimumIntegerDigits: 2 });
  const open = now !== null && now >= targetMs;
  const p = parts(now === null ? 0 : targetMs - now);

  return (
    <div className="space-y-3">
      <p className="text-muted text-sm tracking-[0.2em] uppercase">{open ? t.open : t.label}</p>
      {!open && (
        <ol aria-hidden="true" className="flex gap-6 sm:gap-10" data-testid="countdown">
          {(['days', 'hours', 'minutes', 'seconds'] as const).map((unit) => (
            <li key={unit} className="flex flex-col items-start">
              <span className="font-display text-4xl tabular-nums sm:text-5xl">
                {now === null ? '––' : nf.format(p[unit])}
              </span>
              <span className="text-muted text-xs tracking-wide">{t.units[unit]}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-sm">
        {t.opensOn} <time dateTime={target}>{dateLabel}</time>
      </p>
    </div>
  );
}
