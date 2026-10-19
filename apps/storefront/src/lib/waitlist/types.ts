import type { WaitlistStore } from '@valzaya/core';

export interface WaitlistBackend {
  store: WaitlistStore;
  /** Secret for hashing rate-limit keys. */
  hashSecret: string;
}
