export type StockMode = 'stock' | 'preorder' | 'mto';
export type Gender = 'men' | 'women' | 'unisex';

export interface CatalogueVariant {
  id: string;
  sku: string;
  size: string;
  colourCode: string;
  colourEn: string;
  colourAr: string | null;
  priceFils: number;
  stockMode: StockMode;
  preorderShipDate: string | null;
  /** From variant_availability(): stock -> warehouse available > 0; preorder/mto -> true. */
  available: boolean;
  sortOrder: number;
}

export interface CatalogueProduct {
  id: string;
  slug: string;
  styleCode: string;
  gender: Gender;
  nameEn: string;
  nameAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  fabric: string;
  careEn: string | null;
  careAr: string | null;
  originCountry: string | null;
  variants: CatalogueVariant[];
}

export interface ProductSummary {
  slug: string;
  gender: Gender;
  nameEn: string;
  nameAr: string | null;
  fromPriceFils: number;
  colours: { code: string; en: string; ar: string | null }[];
}

export interface CatalogueDrop {
  id: string;
  number: number;
  slug: string;
  titleEn: string;
  titleAr: string | null;
  earlyAccessAt: string | null;
  opensAt: string;
  closesAt: string | null;
  unitCap: number;
}

export interface CatalogueSource {
  /** settings('store.open'); false (waitlist mode) when the row is missing. */
  isStoreOpen(): Promise<boolean>;
  listProducts(filter: { gender?: 'men' | 'women'; dropSlug?: string }): Promise<ProductSummary[]>;
  getProduct(slug: string): Promise<CatalogueProduct | null>;
  getDrop(slug: string): Promise<CatalogueDrop | null>;
  /** The lowest-numbered published drop (scheduled / early access / open). */
  getCurrentDrop(): Promise<CatalogueDrop | null>;
}

export function summarise(
  p: Omit<CatalogueProduct, 'variants'> & { variants: CatalogueVariant[] },
): ProductSummary {
  const colours = new Map<string, { code: string; en: string; ar: string | null }>();
  for (const v of [...p.variants].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!colours.has(v.colourCode))
      colours.set(v.colourCode, { code: v.colourCode, en: v.colourEn, ar: v.colourAr });
  }
  return {
    slug: p.slug,
    gender: p.gender,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    fromPriceFils: Math.min(...p.variants.map((v) => v.priceFils)),
    colours: [...colours.values()],
  };
}

/** Men's and women's collections include unisex styles. */
export function matchesGender(product: Gender, filter: 'men' | 'women' | undefined): boolean {
  return filter === undefined || product === filter || product === 'unisex';
}
