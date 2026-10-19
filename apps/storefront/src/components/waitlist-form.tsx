'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { joinWaitlist, type FormValues, type WaitlistFormState } from '@/app/[locale]/actions';
import { fill, type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionaries/en';

interface Props {
  locale: Locale;
  refCode: string | null;
  privacyHref: string;
  t: Pick<Dictionary, 'form' | 'errors' | 'success' | 'received'>;
}

const EMPTY: FormValues = { email: '', phone: '', emailConsent: false, whatsappConsent: false };
const INITIAL: WaitlistFormState = { status: 'idle' };

export function WaitlistForm({ locale, refCode, privacyHref, t }: Props) {
  const [state, formAction, pending] = useActionState(joinWaitlist, INITIAL);
  const id = useId();
  const resultRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const done = state.status === 'joined' || state.status === 'received';
  useEffect(() => {
    if (done) resultRef.current?.focus();
    else if (state.status !== 'idle') summaryRef.current?.focus();
  }, [state, done]);

  if (state.status === 'joined') {
    return (
      <div className="space-y-6">
        <h3 ref={resultRef} tabIndex={-1} className="font-display text-3xl outline-none">
          {t.success.title}
        </h3>
        <p className="text-lg" data-testid="queue-position">
          {fill(t.success.position, {
            n: new Intl.NumberFormat(`${locale}-AE`).format(state.position),
          })}
        </p>
        <ShareLink url={state.referralUrl} t={t.success} />
      </div>
    );
  }

  if (state.status === 'received') {
    return (
      <div className="space-y-3">
        <h3 ref={resultRef} tabIndex={-1} className="font-display text-3xl outline-none">
          {t.received.title}
        </h3>
        <p>{t.received.body}</p>
      </div>
    );
  }

  const values = 'values' in state ? state.values : EMPTY;
  const fieldErrors = state.status === 'invalid' ? state.errors : {};
  const formError =
    state.status === 'rate_limited'
      ? t.errors.rate_limited
      : state.status === 'error'
        ? t.errors.server
        : null;
  const messages = [
    ...Object.values(fieldErrors).map((code) => t.errors[code]),
    ...(formError ? [formError] : []),
  ];
  const err = (field: keyof typeof fieldErrors) =>
    fieldErrors[field] ? t.errors[fieldErrors[field]] : null;
  const describe = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined;

  return (
    // Server-rendered values are restored via `key` so a failed submit keeps what was typed.
    <form action={formAction} noValidate className="space-y-6" key={JSON.stringify(values)}>
      <input type="hidden" name="locale" value={locale} />
      {refCode && <input type="hidden" name="ref" value={refCode} />}

      <div
        ref={summaryRef}
        tabIndex={-1}
        role="alert"
        className={
          messages.length
            ? 'border-error/40 bg-error/5 rounded-sm border p-4 outline-none'
            : 'sr-only'
        }
      >
        {messages.length > 0 && (
          <ul className="text-error list-disc space-y-1 ps-5">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </div>

      {err('contact') && (
        <p id={`${id}-contact`} className="text-error text-sm">
          {err('contact')}
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor={`${id}-email`} className="block text-sm font-medium">
          {t.form.email}
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          defaultValue={values.email}
          aria-invalid={Boolean(err('email') || err('contact')) || undefined}
          aria-describedby={describe(
            Boolean(err('email')) && `${id}-email-error`,
            Boolean(err('contact')) && `${id}-contact`,
          )}
          className="field"
        />
        {err('email') && (
          <p id={`${id}-email-error`} className="text-error text-sm">
            {err('email')}
          </p>
        )}
        <Checkbox
          id={`${id}-email-consent`}
          name="emailConsent"
          defaultChecked={values.emailConsent}
          label={t.form.consentEmail}
          error={err('emailConsent')}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor={`${id}-phone`} className="block text-sm font-medium">
          {t.form.phone}
        </label>
        <p id={`${id}-phone-hint`} className="text-muted text-sm">
          {t.form.phoneHint}
        </p>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          defaultValue={values.phone}
          aria-invalid={Boolean(err('phone')) || undefined}
          aria-describedby={describe(
            `${id}-phone-hint`,
            Boolean(err('phone')) && `${id}-phone-error`,
          )}
          className="field"
        />
        {err('phone') && (
          <p id={`${id}-phone-error`} className="text-error text-sm">
            {err('phone')}
          </p>
        )}
        <Checkbox
          id={`${id}-wa-consent`}
          name="whatsappConsent"
          defaultChecked={values.whatsappConsent}
          label={t.form.consentWhatsapp}
          error={err('whatsappConsent')}
        />
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill every field. */}
      <div aria-hidden="true" className="absolute -start-[10000px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>{t.form.honeypot}</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <p className="text-muted text-sm">
        {t.form.privacyNote}{' '}
        <a href={privacyHref} className="hover:text-ink underline underline-offset-4">
          {t.form.privacyLink}
        </a>
      </p>

      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? t.form.pending : t.form.submit}
      </button>
    </form>
  );
}

function Checkbox(props: {
  id: string;
  name: string;
  label: string;
  defaultChecked: boolean;
  error: string | null;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={props.id}
          name={props.name}
          type="checkbox"
          defaultChecked={props.defaultChecked}
          aria-invalid={Boolean(props.error) || undefined}
          aria-describedby={props.error ? `${props.id}-error` : undefined}
          className="accent-olive mt-1 size-5 shrink-0"
        />
        <label htmlFor={props.id} className="text-sm leading-6">
          {props.label}
        </label>
      </div>
      {props.error && (
        <p id={`${props.id}-error`} className="text-error mt-1 text-sm">
          {props.error}
        </p>
      )}
    </div>
  );
}

function ShareLink({ url, t }: { url: string; t: Dictionary['success'] }) {
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(fill(t.shareMessage, { url }))}`;

  return (
    <div className="border-ink/10 space-y-3 border-t pt-6">
      <h4 className="font-medium">{t.shareTitle}</h4>
      <p className="text-muted text-sm">{t.shareBody}</p>
      <label htmlFor={inputId} className="sr-only">
        {t.shareTitle}
      </label>
      <input
        id={inputId}
        readOnly
        value={url}
        dir="ltr"
        data-testid="referral-url"
        className="field"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? t.copied : t.copy}
        </button>
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-secondary">
          {t.whatsapp}
        </a>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? t.copied : ''}
      </p>
    </div>
  );
}
