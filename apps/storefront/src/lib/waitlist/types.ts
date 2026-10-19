import type { WaitlistStore } from '@valzaya/core';

export interface TeaserDrop {
  id: string;
  number: number;
  titleEn: string;
  titleAr: string | null;
  earlyAccessAt: string | null;
  opensAt: string;
}

export interface WaitlistBackend {
  store: WaitlistStore;
  getTeaserDrop(): Promise<TeaserDrop | null>;
  /** Secret for hashing rate-limit keys. */
  hashSecret: string;
}
