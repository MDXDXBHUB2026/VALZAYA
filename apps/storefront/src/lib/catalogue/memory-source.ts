import 'server-only';
import {
  matchesGender,
  summarise,
  type CatalogueDrop,
  type CatalogueProduct,
  type CatalogueSource,
  type CatalogueVariant,
} from './types';

/**
 * In-memory catalogue mirroring supabase/seed.sql (4 products × 2 colours, Drop 01) for e2e
 * tests and credential-free previews. Two sizes are sold out so the UI paths are exercised:
 * VZ-MLS01-SAND-XXL and VZ-WLC01-OLIVE-XS. `STOREFRONT_STORE_OPEN=true` opens the store.
 */
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const COLOURS = [
  { code: 'SAND', en: 'Sand', ar: 'رملي', sort: 0 },
  { code: 'OLIVE', en: 'Olive', ar: 'زيتوني', sort: 1 },
];
const SOLD_OUT = new Set(['VZ-MLS01-SAND-XXL', 'VZ-WLC01-OLIVE-XS']);

const BASE: Omit<CatalogueProduct, 'variants' | 'id' | 'drop'>[] = [
  {
    slug: 'men-linen-set',
    styleCode: 'MLS01',
    gender: 'men',
    nameEn: 'Men’s Linen Set',
    nameAr: 'طقم كتان رجالي',
    descriptionEn: 'Test description: relaxed shirt and drawstring trouser in washed linen.',
    descriptionAr: 'وصف تجريبي: قميص وبنطال من الكتان المغسول.',
    fabric: '100% linen',
    careEn: 'Test care: cold hand wash, line dry.',
    careAr: 'تعليمات تجريبية: غسيل يدوي بماء بارد وتجفيف بالهواء.',
    originCountry: 'AE',
  },
  {
    slug: 'women-linen-co-ord',
    styleCode: 'WLC01',
    gender: 'women',
    nameEn: 'Women’s Linen Co-ord',
    nameAr: 'طقم كتان نسائي',
    descriptionEn: 'Test description: wrap top and wide-leg trouser in washed linen.',
    descriptionAr: 'وصف تجريبي: بلوزة ملفوفة وبنطال واسع من الكتان المغسول.',
    fabric: '100% linen',
    careEn: 'Test care: cold hand wash, line dry.',
    careAr: 'تعليمات تجريبية: غسيل يدوي بماء بارد وتجفيف بالهواء.',
    originCountry: 'AE',
  },
  {
    slug: 'linen-shirt',
    styleCode: 'LSH01',
    gender: 'unisex',
    nameEn: 'Linen Shirt',
    nameAr: 'قميص كتان',
    descriptionEn: 'Test description: classic camp-collar linen shirt.',
    descriptionAr: 'وصف تجريبي: قميص كتان كلاسيكي.',
    fabric: '100% linen',
    careEn: 'Test care: cold machine wash, line dry.',
    careAr: 'تعليمات تجريبية: غسيل في الغسالة بماء بارد وتجفيف بالهواء.',
    originCountry: 'AE',
  },
  {
    slug: 'linen-scarf',
    styleCode: 'LSC01',
    gender: 'unisex',
    nameEn: 'Linen Scarf',
    nameAr: 'وشاح كتان',
    descriptionEn: 'Test description: lightweight frayed-edge linen scarf.',
    descriptionAr: 'وصف تجريبي: وشاح كتان خفيف.',
    fabric: '100% linen',
    careEn: 'Test care: cold hand wash, dry flat.',
    careAr: 'تعليمات تجريبية: غسيل يدوي بماء بارد وتجفيف مسطح.',
    originCountry: 'AE',
  },
];

const PRICING: Record<
  string,
  { price: number; mode: CatalogueVariant['stockMode']; ship: string | null }
> = {
  MLS01: { price: 145_000, mode: 'stock', ship: null },
  WLC01: { price: 135_000, mode: 'stock', ship: null },
  LSH01: { price: 65_000, mode: 'preorder', ship: '2026-12-15' },
  LSC01: { price: 29_500, mode: 'stock', ship: null },
};

const PRODUCTS: Omit<CatalogueProduct, 'drop'>[] = BASE.map((p, i) => {
  const { price, mode, ship } = PRICING[p.styleCode]!;
  const sizes = p.styleCode === 'LSC01' ? ['OS'] : SIZES;
  const variants = COLOURS.flatMap((c) =>
    sizes.map((size, s): CatalogueVariant => {
      const sku = `VZ-${p.styleCode}-${c.code}-${size}`;
      return {
        id: `${i + 1}-${c.code}-${size}`,
        sku,
        size,
        colourCode: c.code,
        colourEn: c.en,
        colourAr: c.ar,
        priceFils: price,
        stockMode: mode,
        preorderShipDate: ship,
        available: !SOLD_OUT.has(sku),
        sortOrder: c.sort * 10 + s,
      };
    }),
  );
  return { ...p, id: `p${i + 1}`, variants };
});

const DROP_01: CatalogueDrop = {
  id: '20000000-0000-4000-8000-000000000001',
  number: 1,
  slug: 'drop-01',
  titleEn: 'Drop 01',
  titleAr: 'الإصدار 01',
  earlyAccessAt: '2026-11-19T12:00:00Z',
  opensAt: '2026-11-20T12:00:00Z',
  closesAt: '2026-12-04T19:59:00Z',
  unitCap: 60,
};

export function createMemoryCatalogue(): CatalogueSource {
  return {
    isStoreOpen: async () => process.env.STOREFRONT_STORE_OPEN === 'true',
    listProducts: async ({ gender, dropSlug }) => {
      if (dropSlug !== undefined && dropSlug !== DROP_01.slug) return [];
      return PRODUCTS.filter((p) => matchesGender(p.gender, gender)).map(summarise);
    },
    getProduct: async (slug) => {
      const p = PRODUCTS.find((x) => x.slug === slug);
      // Every seeded variant is in Drop 01; nothing is sold or held in memory mode.
      return p ? { ...p, drop: { ...DROP_01, unitsLeft: DROP_01.unitCap } } : null;
    },
    getDrop: async (slug) => (slug === DROP_01.slug ? DROP_01 : null),
    getCurrentDrop: async () => DROP_01,
  };
}
