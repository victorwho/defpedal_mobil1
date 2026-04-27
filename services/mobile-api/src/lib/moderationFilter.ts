/**
 * Server-side regex prefilter for UGC moderation.
 *
 * Compliance plan item 7: as a sole-moderator setup, the queue cannot scale
 * with growth. We pre-flag the obvious cases (slurs, doxxing patterns,
 * threats) so they get auto-hidden and queued for human review without
 * blocking other users from seeing the post in the meantime.
 *
 * Pattern lists are deliberately conservative — false positives are tolerable
 * (the comment goes to the moderation queue rather than being silently
 * deleted), false negatives are tolerable (the report flow catches them).
 *
 * Wordlist is intentionally NOT exhaustive. Iterate as patterns emerge in
 * the queue. Keeping the full slur list out of source control reduces the
 * chance the file leaks into screenshots / PR diffs / search indexes.
 *
 * The two languages match the launch market (Romania) and the secondary
 * (English) one. Add other locales as they're rolled out.
 */

// Patterns are kept loose intentionally — `\b` boundaries on Unicode letters
// don't always work in JS regex, so we accept some over-matching for now.
const SLUR_PATTERNS_EN = [
  /\b(n[i1]gg(?:er|a)|f[a4]gg(?:ot|y))\b/i,
  /\b(?:k[i1]ke|sp[i1]ck|ch[i1]nk|tr[a4]nny)\b/i,
];

const SLUR_PATTERNS_RO = [
  /\bțig+ani[uy]?\b/i, // ethnic slur in RO context — flag for review
  /\bjid[a4]ni?\b/i,
];

const THREAT_PATTERNS = [
  /\b(?:i\s+will\s+kill\s+you|kill\s+yourself|kys)\b/i,
  /\b(?:te\s+omor|te\s+bat)\b/i,
];

// Doxxing: phone-number-shaped sequences and full-address fragments.
// Romanian mobile numbers start with 07x and are 10 digits.
const DOXX_PATTERNS = [
  /\+?40\s*7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/, // RO mobile
  /\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/, // generic 10-digit phone
];

export type FilterCategory = 'slur' | 'threat' | 'doxx';

export type FilterResult = {
  flagged: boolean;
  category: FilterCategory | null;
  pattern: string | null;
};

const NEUTRAL: FilterResult = { flagged: false, category: null, pattern: null };

const checkAgainst = (
  text: string,
  patterns: readonly RegExp[],
  category: FilterCategory,
): FilterResult => {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return { flagged: true, category, pattern: pattern.source };
    }
  }
  return NEUTRAL;
};

export const checkContentAgainstFilter = (text: string): FilterResult => {
  if (!text) return NEUTRAL;

  const slurEn = checkAgainst(text, SLUR_PATTERNS_EN, 'slur');
  if (slurEn.flagged) return slurEn;

  const slurRo = checkAgainst(text, SLUR_PATTERNS_RO, 'slur');
  if (slurRo.flagged) return slurRo;

  const threats = checkAgainst(text, THREAT_PATTERNS, 'threat');
  if (threats.flagged) return threats;

  const doxx = checkAgainst(text, DOXX_PATTERNS, 'doxx');
  if (doxx.flagged) return doxx;

  return NEUTRAL;
};
