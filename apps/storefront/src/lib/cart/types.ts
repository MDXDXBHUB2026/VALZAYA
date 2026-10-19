import type { StockMode } from '../catalogue';

/** One bag line, joined with what the bag page shows. Prices are VAT-inclusive fils. */
export interface BagLine {
  variantId: string;
  sku: string;
  productSlug: string;
  nameEn: string;
  nameAr: string | null;
  colourCode: string;
  colourEn: string;
  colourAr: string | null;
  size: string;
  unitPriceFils: number;
  quantity: number;
  stockMode: StockMode;
  preorderShipDate: string | null;
  /** Same meaning as on the product page; checkout refuses unavailable lines. */
  available: boolean;
}

/** `closed`: the token's cart was checked out or merged; issue a new token and retry. */
export type CartWriteResult = 'ok' | 'closed' | 'not_on_sale';

/** Guest carts, addressed by the SHA-256 hex of the cookie token. Server-side only. */
export interface CartBackend {
  getLines(tokenHash: string): Promise<BagLine[]>;
  add(tokenHash: string, variantId: string, quantity: number): Promise<CartWriteResult>;
  setQuantity(tokenHash: string, variantId: string, quantity: number): Promise<CartWriteResult>;
  /** Fixed-window limiter (public.hit_rate_limit); true while under the limit. */
  hitRateLimit(
    bucket: string,
    keyHash: string,
    max: number,
    windowSeconds: number,
  ): Promise<boolean>;
  /** Secret for hashing rate-limit keys. */
  hashSecret: string;
}
