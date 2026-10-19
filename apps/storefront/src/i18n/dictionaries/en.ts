// English UI copy. Founder and fabric stories are PLACEHOLDERS until real brand copy exists.
const en = {
  meta: {
    title: 'Valzaya — Drop 01 waitlist',
    description:
      'Natural-fabric apparel from the UAE, made in numbered, limited drops. Join the waitlist for Drop 01.',
  },
  nav: {
    switchTo: 'العربية',
  },
  hero: {
    eyebrow: 'Drop 01',
    title: 'Linen, made slowly.',
    line: 'Natural fabrics. Numbered drops. Made in limited runs, then gone.',
    cta: 'Join the waitlist',
  },
  countdown: {
    label: 'Early access opens in',
    open: 'Early access is open',
    units: { days: 'days', hours: 'hours', minutes: 'minutes', seconds: 'seconds' },
    opensOn: 'Opens',
  },
  founder: {
    title: 'From the founder',
    body: 'Placeholder — the founder story will appear here. It explains why Valzaya exists, who makes the garments and why each drop is limited.',
  },
  fabric: {
    title: 'The fabric',
    body: 'Placeholder — the fabric story will appear here: where the linen and long-staple cotton come from, how they are woven and washed, and how to care for them.',
  },
  form: {
    title: 'Join the waitlist',
    intro:
      'Be the first to hear when Drop 01 opens. Leave your email, your WhatsApp number, or both.',
    email: 'Email',
    phone: 'WhatsApp number',
    phoneHint: 'UAE numbers can start with 05. Elsewhere, include the country code, e.g. +44.',
    consentEmail: 'Email me about Valzaya drops. I can unsubscribe at any time.',
    consentWhatsapp: 'Message me on WhatsApp about Valzaya drops. I can opt out at any time.',
    privacyNote: 'We use these details only to tell you about Valzaya drops.',
    privacyLink: 'Privacy notice',
    submit: 'Join the waitlist',
    pending: 'Joining…',
    honeypot: 'Leave this field empty',
  },
  errors: {
    contact_required: 'Enter an email address or a WhatsApp number.',
    email_invalid: 'Enter a valid email address.',
    phone_invalid: 'Enter a valid number, e.g. 050 123 4567 or +44 7700 900123.',
    email_consent_required: 'Tick the box so we may email you.',
    whatsapp_consent_required: 'Tick the box so we may message you on WhatsApp.',
    rate_limited: 'Too many attempts. Please try again in a few minutes.',
    server: 'Something went wrong on our side. Please try again.',
  },
  success: {
    title: 'You’re on the list.',
    position: 'You are #{n} on the waitlist for Drop 01.',
    shareTitle: 'Share your personal link',
    shareBody: 'Friends who join through your link are counted as your referrals.',
    copy: 'Copy link',
    copied: 'Link copied',
    whatsapp: 'Share on WhatsApp',
    shareMessage: 'I’ve joined the Valzaya Drop 01 waitlist. Join here: {url}',
  },
  received: {
    title: 'Thank you — you’re on the list.',
    body: 'If you have signed up before, there is nothing more to do. We’ll be in touch before Drop 01 opens.',
  },
  privacy: {
    title: 'Privacy notice',
    pending: 'PENDING LEGAL REVIEW',
    body: 'This is a placeholder. The full privacy notice, aligned with the UAE Personal Data Protection Law, will be published here before launch. Until then: we use the email address or WhatsApp number you give us only to tell you about Valzaya drops, and only with your consent. You can ask us to delete your details at any time.',
    back: 'Back to the waitlist',
  },
  footer: {
    rights: '© 2026 Valzaya',
    privacy: 'Privacy notice',
  },
};

export default en;
export type Dictionary = typeof en;
