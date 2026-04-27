/**
 * Server-side comment sanitisation.
 *
 * Compliance plan item 7: comments are public UGC and a vector for spam /
 * phishing. We don't try to detect every adversarial pattern; we just strip
 * the most common abuse vector (links) and let the moderator review the rest.
 *
 * Returns the sanitised body and a `flagged` boolean. When flagged, the
 * caller should auto-mark the comment is_hidden=true and insert a
 * content_reports row tagged auto_filter=true.
 */

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;
// Bare-domain pattern catches "checkout site.example/x" without scheme. Conservative
// — only matches obvious TLDs to avoid flagging things like "v0.2.20".
const BARE_DOMAIN_PATTERN =
  /\b[a-z0-9-]+\.(?:com|net|org|io|co|app|tk|ml|ga|cf|xyz|info|biz|me|ru|cn|ro|eu)\b(?:\/[^\s<>"']*)?/gi;

export type SanitiseResult = {
  body: string;
  flagged: boolean;
  reason: 'url' | null;
};

export const sanitiseComment = (input: string): SanitiseResult => {
  const trimmed = input.trim();

  if (URL_PATTERN.test(trimmed) || BARE_DOMAIN_PATTERN.test(trimmed)) {
    return {
      body: trimmed,
      flagged: true,
      reason: 'url',
    };
  }

  return {
    body: trimmed,
    flagged: false,
    reason: null,
  };
};
