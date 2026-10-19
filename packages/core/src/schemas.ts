import { z } from 'zod';
import { ORDER_STATUSES } from './order-state-machine';

/** SKU pattern: VZ-<style>-<colour>-<size>, uppercase alphanumerics. Mirrors the DB CHECK. */
export const SKU_REGEX = /^VZ-[A-Z0-9]{2,16}-[A-Z0-9]{2,16}-[A-Z0-9]{1,6}$/;
export const skuSchema = z.string().regex(SKU_REGEX, 'SKU must look like VZ-<style>-<colour>-<size>');

export function buildSku(style: string, colour: string, size: string): string {
  return skuSchema.parse(`VZ-${style}-${colour}-${size}`.toUpperCase());
}

/** Order number: VZ- + at least 6 zero-padded digits. Mirrors the DB default/CHECK. */
export const ORDER_NUMBER_REGEX = /^VZ-\d{6,}$/;
export const orderNumberSchema = z.string().regex(ORDER_NUMBER_REGEX);

export function formatOrderNumber(seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new RangeError(`invalid order sequence ${seq}`);
  return `VZ-${String(seq).padStart(6, '0')}`;
}

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export const STOCK_MODES = ['stock', 'preorder', 'mto'] as const;
export const PAYMENT_PROVIDERS = ['card', 'tabby', 'tamara'] as const;
export const STAFF_ROLES = ['owner', 'ops'] as const;
export const UAE_EMIRATES = [
  'abu_dhabi',
  'dubai',
  'sharjah',
  'ajman',
  'umm_al_quwain',
  'ras_al_khaimah',
  'fujairah',
] as const;

export const filsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export const stockModeSchema = z.enum(STOCK_MODES);
export const paymentProviderSchema = z.enum(PAYMENT_PROVIDERS);
export const staffRoleSchema = z.enum(STAFF_ROLES);
export const emirateSchema = z.enum(UAE_EMIRATES);
export const localeSchema = z.enum(['en', 'ar']);
