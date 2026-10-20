import type { CheckoutField } from '@valzaya/core';

export const CHECKOUT_FIELDS = [
  'email',
  'phone',
  'recipientName',
  'line1',
  'line2',
  'area',
  'city',
  'emirate',
  'delivery',
] as const satisfies readonly CheckoutField[];

export type CheckoutValues = Record<CheckoutField, string>;
export type CheckoutState =
  | { status: 'idle' }
  | { status: 'invalid'; errors: CheckoutField[]; values: CheckoutValues }
  | { status: 'refused'; reason: string; values: CheckoutValues }
  | { status: 'busy' | 'error'; values: CheckoutValues };
