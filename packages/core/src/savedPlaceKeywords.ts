/**
 * Saved-place keyword matching (audit 2026-07-05 UX-17).
 *
 * Typing "home"/"work" in a search field surfaces the saved Home/Work place
 * instead of a normal geocode. The keyword list must be shared between the
 * route-planning fetch-suppression (isSavedPlaceKeyword) and the SearchBar
 * row-injection (keywordPlace) — if they drift, typing a keyword suppresses
 * autocomplete without showing the saved place, leaving the field dead.
 *
 * English-only matching left RO/ES riders unable to use the shortcut, so the
 * list includes localized synonyms. Diacritics are stripped before matching
 * so "acasa" matches "acasă".
 */

export type SavedPlaceType = 'home' | 'work';

const stripDiacritics = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const normalize = (s: string): string => stripDiacritics(s.trim().toLowerCase());

// Keyed by type; values are already diacritic-stripped + lowercased.
const KEYWORDS: Record<SavedPlaceType, readonly string[]> = {
  home: ['home', 'acasa', 'casa'],
  work: ['work', 'birou', 'serviciu', 'trabajo', 'oficina'],
};

/** The saved-place type a query keyword refers to, or null if it isn't one. */
export const matchSavedPlaceKeyword = (query: string): SavedPlaceType | null => {
  const q = normalize(query);
  if (!q) return null;
  if (KEYWORDS.home.includes(q)) return 'home';
  if (KEYWORDS.work.includes(q)) return 'work';
  return null;
};
