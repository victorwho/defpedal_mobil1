/**
 * Locale-keyed copy for the four first-ride / re-engagement templates.
 *
 * Split out of firstRideNotifications.ts (2026-08-13, review finding G-25):
 * the bodies used to be hardcoded English, so a Romanian or Spanish rider
 * got an English push while every other surface in the app spoke their
 * language.
 *
 * DEDUPE MARKERS — read before editing any body string. The "already sent"
 * guards in firstRideNotifications.ts have no template column to query;
 * they match a substring of the body in `notification_log`. Localizing the
 * bodies therefore means the guard has to look for the marker in EVERY
 * locale, or a rider who switched languages (or whose locale column was
 * added after their first send) gets the same nudge twice. Each marker MUST
 * be a verbatim substring of that locale's body, and the English markers
 * must never change — they are the only thing matching the rows written
 * before this file existed.
 *
 * Markers must not contain `,` (it separates terms in a PostgREST `or=()`
 * filter) or `%`/`*` (LIKE wildcards).
 */
import type { FirstRideTemplate } from './firstRideNotifications';
import { toNudgeLocale, type NudgeLocale } from './nudges/locale';

export type FirstRideLocale = NudgeLocale;

/**
 * Narrow whatever `profiles.preferred_locale` holds to a locale we have copy
 * for. Thin alias over the shared `toNudgeLocale` (accepts region tags like
 * "es-ES"; anything unknown, null, or of the wrong type falls back to
 * English) so the two push stacks can never disagree on locale resolution.
 */
export const normalizeFirstRideLocale = (raw: unknown): FirstRideLocale =>
  toNudgeLocale(raw);

interface TemplateCopy {
  readonly title: string;
  readonly body: string;
}

export const FIRST_RIDE_COPY: Record<
  FirstRideTemplate,
  Record<FirstRideLocale, TemplateCopy>
> = {
  first_ride_nudge: {
    en: {
      title: 'Your First Ride Awaits',
      body: 'Your first route is ready — just 5 minutes on quiet streets near home. This weekend could be the start of something great.',
    },
    ro: {
      title: 'Prima ta tură te așteaptă',
      body: 'Prima ta rută e gata — doar 5 minute pe străzi liniștite, aproape de casă. Weekendul ăsta poate fi începutul a ceva frumos.',
    },
    es: {
      title: 'Tu primera ruta te espera',
      body: 'Tu primera ruta está lista: solo 5 minutos por calles tranquilas cerca de casa. Este fin de semana puede ser el principio de algo grande.',
    },
  },

  post_first_ride: {
    en: {
      title: 'You Did It!',
      body: 'Yesterday you rode for the first time. Remember how good that felt? Another short ride is waiting for you.',
    },
    ro: {
      title: 'Ai reușit!',
      body: 'Ieri ai pedalat pentru prima oară. Îți amintești ce bine a fost? Te așteaptă încă o tură scurtă.',
    },
    es: {
      title: '¡Lo has conseguido!',
      body: 'Ayer pedaleaste por primera vez. ¿Recuerdas lo bien que sentó? Te espera otra ruta corta.',
    },
  },

  // Sent Fri/Sat, and only when the rider's OWN forecast for the day clears
  // `isGoodCyclingDay`. The copy deliberately claims nothing beyond that:
  // the forecast client fetches a single day, so promising a whole weekend
  // of sunshine would put us right back in G-25.
  weather_invitation: {
    en: {
      title: 'Good Day for a Ride',
      body: 'The weather looks good for cycling today. A short ride through quiet streets?',
    },
    ro: {
      title: 'Zi bună de pedalat',
      body: 'Vremea arată bine pentru bicicletă azi. O tură scurtă pe străzi liniștite?',
    },
    es: {
      title: 'Buen día para rodar',
      body: 'Hoy el tiempo acompaña para ir en bici. ¿Una ruta corta por calles tranquilas?',
    },
  },

  lapsed_reengagement: {
    en: {
      title: 'We Miss You',
      body: "It's been a while — that's okay. Your route is still here whenever you're ready. No pressure.",
    },
    ro: {
      title: 'Ne e dor de tine',
      body: 'A trecut ceva timp — e în regulă. Ruta ta e tot aici, când ești pregătit. Fără presiune.',
    },
    es: {
      title: 'Te echamos de menos',
      body: 'Ha pasado un tiempo, y no pasa nada. Tu ruta sigue aquí cuando quieras. Sin prisa.',
    },
  },
};

/**
 * Per-template "have we already sent this?" markers, one per locale.
 * `weather_invitation` has none — it is gated by the weekend window, the
 * 3-day lapse and the weekly budget rather than a once-ever guard.
 */
export const DEDUPE_MARKERS: Partial<Record<FirstRideTemplate, readonly string[]>> = {
  // 'first route' is the legacy English marker — rows predating localization
  // only match on this one.
  first_ride_nudge: ['first route', 'prima ta rută', 'tu primera ruta'],
  post_first_ride: ['first time', 'prima oară', 'primera vez'],
  lapsed_reengagement: ['been a while', 'a trecut ceva timp', 'ha pasado un tiempo'],
};

/** PostgREST `or=()` term list matching any locale's marker in `body`. */
export const dedupeFilter = (template: FirstRideTemplate): string | null => {
  const markers = DEDUPE_MARKERS[template];
  if (!markers || markers.length === 0) return null;
  return markers.map((m) => `body.ilike.*${m}*`).join(',');
};
