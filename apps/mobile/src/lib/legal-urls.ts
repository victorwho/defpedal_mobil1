// Public-facing legal pages. Hosted on the same Vercel deployment as the
// email-confirmation page (apps/web). When the full Terms of Service and
// Privacy Policy land (compliance plan item 3), these URLs do not change —
// the page contents are swapped out underneath.
//
// Centralised here so callers (signup footer, profile, FAQ) reference one
// constant and a future change to the legal hosting only edits this file.

export const TERMS_URL = 'https://routes.defensivepedal.com/terms';
export const PRIVACY_URL = 'https://routes.defensivepedal.com/privacy';
