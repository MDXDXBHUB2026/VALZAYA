'use client';

import type { CheckoutField, DeliveryOption } from '@valzaya/core';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { placeOrder } from '@/app/[locale]/checkout/actions';
import type { CheckoutState, CheckoutValues } from '@/app/[locale]/checkout/fields';
import { fill, type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries/en';

export interface DeliveryChoice {
  option: DeliveryOption;
  /** Formatted price, or the "Free" label. */
  priceLabel: string;
  /** Formatted order total and VAT with this option. */
  total: string;
  vat: string;
}

interface Props {
  locale: Locale;
  t: Dictionary['checkout'];
  itemsLabel: string;
  deliveries: DeliveryChoice[];
}

const EMPTY: CheckoutValues = {
  email: '',
  phone: '',
  recipientName: '',
  line1: '',
  line2: '',
  area: '',
  city: '',
  emirate: '',
  delivery: 'standard',
};
const INITIAL: CheckoutState = { status: 'idle' };
const EMIRATES = [
  'abu_dhabi',
  'dubai',
  'sharjah',
  'ajman',
  'umm_al_quwain',
  'ras_al_khaimah',
  'fujairah',
] as const;

export function CheckoutForm({ locale, t, itemsLabel, deliveries }: Props) {
  const [state, formAction, pending] = useActionState(placeOrder, INITIAL);
  const id = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const values = 'values' in state ? state.values : EMPTY;
  const [delivery, setDelivery] = useState<string>(values.delivery || 'standard');

  useEffect(() => {
    if (state.status !== 'idle') summaryRef.current?.focus();
  }, [state]);

  const errors = new Set<CheckoutField>(state.status === 'invalid' ? state.errors : []);
  const banner =
    state.status === 'invalid'
      ? t.errorSummary
      : state.status === 'refused'
        ? (t.refused[state.reason as keyof typeof t.refused] ?? t.error)
        : state.status === 'busy'
          ? t.busy
          : state.status === 'error'
            ? t.error
            : null;
  const chosen = deliveries.find((d) => d.option === delivery) ?? deliveries[0];

  const field = (
    name: CheckoutField,
    label: string,
    input: React.InputHTMLAttributes<HTMLInputElement>,
    hint?: string,
  ) => (
    <div className="space-y-2">
      <label htmlFor={`${id}-${name}`} className="block text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${id}-${name}-hint`} className="text-muted text-sm">
          {hint}
        </p>
      )}
      <input
        id={`${id}-${name}`}
        name={name}
        defaultValue={values[name]}
        aria-invalid={errors.has(name) || undefined}
        aria-describedby={
          [hint && `${id}-${name}-hint`, errors.has(name) && `${id}-${name}-error`]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className="field"
        {...input}
      />
      {errors.has(name) && (
        <p id={`${id}-${name}-error`} className="text-error text-sm">
          {t.errors[name]}
        </p>
      )}
    </div>
  );

  return (
    // `key` restores what was typed after a failed submit (the form is uncontrolled).
    <form
      action={formAction}
      noValidate
      className="grid gap-10 lg:grid-cols-[1fr_20rem]"
      key={JSON.stringify(values)}
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="space-y-8">
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className={
            banner ? 'border-error/40 bg-error/5 rounded-sm border p-4 outline-none' : 'sr-only'
          }
        >
          {banner && <p className="text-error">{banner}</p>}
        </div>

        <fieldset className="space-y-4">
          <legend className="font-display mb-2 text-2xl">{t.contact}</legend>
          {field('email', t.email, {
            type: 'email',
            inputMode: 'email',
            autoComplete: 'email',
            dir: 'ltr',
          })}
          {field(
            'phone',
            t.phone,
            { type: 'tel', inputMode: 'tel', autoComplete: 'tel', dir: 'ltr' },
            t.phoneHint,
          )}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-display mb-2 text-2xl">{t.address}</legend>
          {field('recipientName', t.recipientName, { autoComplete: 'name' })}
          {field('line1', t.line1, { autoComplete: 'address-line1' })}
          {field('line2', t.line2, { autoComplete: 'address-line2' })}
          {field('area', t.area, { autoComplete: 'address-level3' })}
          {field('city', t.city, { autoComplete: 'address-level2' })}
          <div className="space-y-2">
            <label htmlFor={`${id}-emirate`} className="block text-sm font-medium">
              {t.emirate}
            </label>
            <select
              id={`${id}-emirate`}
              name="emirate"
              defaultValue={values.emirate}
              autoComplete="address-level1"
              aria-invalid={errors.has('emirate') || undefined}
              aria-describedby={errors.has('emirate') ? `${id}-emirate-error` : undefined}
              className="field"
            >
              <option value="">{t.chooseEmirate}</option>
              {EMIRATES.map((e) => (
                <option key={e} value={e}>
                  {t.emirates[e]}
                </option>
              ))}
            </select>
            {errors.has('emirate') && (
              <p id={`${id}-emirate-error`} className="text-error text-sm">
                {t.errors.emirate}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-display mb-2 text-2xl">{t.delivery}</legend>
          {deliveries.map((d) => (
            <label
              key={d.option}
              className="border-ink/20 has-[:checked]:border-ink flex items-center justify-between gap-4 rounded-sm border px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="delivery"
                  value={d.option}
                  defaultChecked={d.option === (values.delivery || 'standard')}
                  onChange={() => setDelivery(d.option)}
                  className="accent-ink size-4"
                />
                {t.deliveryOptions[d.option]}
              </span>
              <span>{d.priceLabel}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <aside aria-labelledby={`${id}-summary`} className="space-y-3 lg:pt-12">
        <h2 id={`${id}-summary`} className="font-display text-2xl">
          {t.summary}
        </h2>
        <p className="flex justify-between text-sm">
          <span>{t.subtotal}</span>
          <span>{itemsLabel}</span>
        </p>
        <p className="flex justify-between text-sm">
          <span>{t.shipping}</span>
          <span>{chosen?.priceLabel}</span>
        </p>
        <p className="border-ink/10 flex justify-between border-t pt-3 text-lg">
          <span>{t.total}</span>
          <span data-testid="checkout-total">{chosen?.total}</span>
        </p>
        <p className="text-muted text-sm" data-testid="checkout-vat">
          {fill(t.vatLine, { vat: chosen?.vat ?? '' })}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary inline-flex w-full"
          data-testid="place-order"
        >
          {pending ? t.paying : t.pay}
        </button>
        <p className="text-muted text-xs">{t.payNote}</p>
      </aside>
    </form>
  );
}
