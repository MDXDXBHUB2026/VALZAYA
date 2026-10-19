import 'server-only';
import type { WaitlistJoinInput, WaitlistJoinResult, WaitlistStore } from '@valzaya/core';
import type { WaitlistBackend } from './types';

/**
 * In-memory backend for end-to-end tests and local previews without database credentials.
 * Mirrors public.join_waitlist / public.hit_rate_limit semantics. Never used on Vercel.
 */
interface Signup {
  id: number;
  email: string | null;
  phone: string | null;
  referralCode: string;
  referredBy: number | null;
}

interface MemoryState {
  signups: Signup[];
  hits: Map<string, number>;
}

const globalForMemory = globalThis as typeof globalThis & { __valzayaWaitlist?: MemoryState };

function state(): MemoryState {
  globalForMemory.__valzayaWaitlist ??= { signups: [], hits: new Map() };
  return globalForMemory.__valzayaWaitlist;
}

function newCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
}

export function createMemoryBackend(): WaitlistBackend {
  const store: WaitlistStore = {
    async join(input: WaitlistJoinInput): Promise<WaitlistJoinResult> {
      const s = state();
      const existing = s.signups.find(
        (x) =>
          (input.email !== null && x.email === input.email) ||
          (input.phone !== null && x.phone === input.phone),
      );
      const signup =
        existing ??
        (() => {
          const referrer = input.refCode
            ? s.signups.find((x) => x.referralCode === input.refCode)
            : undefined;
          const created: Signup = {
            id: s.signups.length + 1,
            email: input.email,
            phone: input.phone,
            referralCode: newCode(),
            referredBy: referrer?.id ?? null,
          };
          s.signups.push(created);
          return created;
        })();
      return {
        referralCode: signup.referralCode,
        position: signup.id,
        alreadyJoined: existing !== undefined,
      };
    },

    async hitRateLimit(bucket, keyHash, max, windowSeconds) {
      const window = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `${bucket}|${keyHash}|${window}`;
      const hits = (state().hits.get(key) ?? 0) + 1;
      state().hits.set(key, hits);
      return hits <= max;
    },
  };

  return { store, hashSecret: 'memory-backend-not-secret' };
}
