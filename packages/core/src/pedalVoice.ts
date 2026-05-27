/**
 * Pedal voice charter — message catalog + variant selection.
 *
 * Pure functions only — no I/O, no clock side effects. The caller supplies
 * a context (rider name, streak count, city, locale, sassy/neutral, userId
 * for sticky-bucket variant assignment) and gets back a rendered message.
 *
 * Voice rules (locked in plan section 6.1):
 *   1. Witty, never cruel. Pedal teases but doesn't insult.
 *   2. Self-aware mascot — Pedal can break the fourth wall.
 *   3. Cycling-knowledgeable. References rider's neighborhood / streak.
 *   4. No emoji as load-bearing semantics. Pedal pose carries the visual.
 *   5. RO register is slightly more formal but stays cheeky.
 *
 * Each trigger ships with 3 sassy variants for A/B testing. Variant
 * selection is sticky per (user_id, trigger_id) via deterministic hash —
 * the same user always sees the same variant of a given trigger, so
 * A/B groups stay stable across sessions and don't fragment attribution.
 *
 * Neutral mode (rider toggled "sassy off") always renders the FIRST
 * variant. Neutral copy is intentionally functional, never edgy.
 */

import type { MascotPose } from './mascotPose';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NudgeTrigger =
  | 'post_ride_celebration'
  | 'post_hazard_thanks'
  | 'streak_at_risk_mild'
  | 'streak_at_risk_dramatic'
  | 'daily_ride_reminder'
  | 'milestone_celebration'
  | 'badge_proximity'
  | 'lapsed_reengagement'
  | 'community_signal'
  | 'streak_lost_apology';

export type NudgeLocale = 'en' | 'ro' | 'es';

export type NudgePriority = 0 | 1 | 2 | 3;

export interface NudgeContext {
  readonly riderName?: string;
  readonly streakCount?: number;
  readonly milestoneDay?: number;
  readonly city?: string;
  readonly badgeLabel?: string;
  readonly lapsedDays?: number;
}

export interface PedalVoiceRequest {
  readonly trigger: NudgeTrigger;
  readonly locale: NudgeLocale;
  readonly context: NudgeContext;
  /** Profile setting — false renders the neutral first variant. */
  readonly sassy: boolean;
  /** Required for sticky-bucket variant assignment. */
  readonly userId: string;
}

export interface PedalVoiceMessage {
  readonly title: string;
  readonly body: string;
  readonly variantId: string;
  readonly mascotPose: MascotPose;
  readonly priority: NudgePriority;
}

interface VariantTemplate {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

interface TriggerCatalog {
  readonly priority: NudgePriority;
  readonly mascotPose: MascotPose;
  /** Variants are ordered: index 0 is also the neutral copy. */
  readonly variants: {
    readonly en: readonly VariantTemplate[];
    readonly ro: readonly VariantTemplate[];
    readonly es: readonly VariantTemplate[];
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Master message catalog. 10 triggers × 3 locales × 3 variants = 90 entries.
 * Title and body templates use `{placeholder}` interpolation.
 *
 * IMPORTANT: When adding a placeholder, also list it in the renderer's
 * known-keys map so a missing context value falls back gracefully instead
 * of leaking a literal `{name}` to the user.
 */
const CATALOG: Record<NudgeTrigger, TriggerCatalog> = {
  post_ride_celebration: {
    priority: 0,
    mascotPose: 'cheer',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Ride saved',
          body: 'Streak day {streakCount}. Nicely done, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Look at you',
          body: '{streakCount} days in a row. I am not crying, you are crying.',
        },
        {
          id: 'v3',
          title: 'Pedal is thrilled',
          body: '{streakCount} days. I am updating my LinkedIn to say I know you.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Cursă salvată',
          body: 'Ziua {streakCount} din streak. Bravo, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Uite-te la tine',
          body: '{streakCount} zile la rând. Eu? Nu plâng deloc.',
        },
        {
          id: 'v3',
          title: 'Pedal e mândru',
          body: '{streakCount} zile. Îmi schimb biografia să spună că te cunosc.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Ruta guardada',
          body: 'Día {streakCount} de racha. Bien hecho, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Mírate a ti',
          body: '{streakCount} días seguidos. No estoy llorando, lloras tú.',
        },
        {
          id: 'v3',
          title: 'Pedal está encantado',
          body: '{streakCount} días. Voy a actualizar mi LinkedIn diciendo que te conozco.',
        },
      ],
    },
  },

  post_hazard_thanks: {
    priority: 0,
    mascotPose: 'cheer',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Hazard reported',
          body: 'Thanks, {riderName}. Other riders nearby will see this.',
        },
        {
          id: 'v2',
          title: 'Public service announcement',
          body: 'Pedal logged it. The next rider through {city} owes you a beer.',
        },
        {
          id: 'v3',
          title: 'Saved a tire today',
          body: 'Your report is live. Pedal salutes you with one paw.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Pericol raportat',
          body: 'Mulțumesc, {riderName}. Ceilalți cicliști vor vedea raportul.',
        },
        {
          id: 'v2',
          title: 'Anunț public',
          body: 'Pedal a notat. Următorul ciclist prin {city} îți datorează o bere.',
        },
        {
          id: 'v3',
          title: 'Ai salvat o roată azi',
          body: 'Raportul e activ. Pedal te salută cu o lăbuță.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Peligro reportado',
          body: 'Gracias, {riderName}. Los demás ciclistas cerca lo verán.',
        },
        {
          id: 'v2',
          title: 'Aviso público',
          body: 'Pedal lo ha registrado. El próximo ciclista por {city} te debe una caña.',
        },
        {
          id: 'v3',
          title: 'Has salvado una rueda hoy',
          body: 'Tu reporte está en directo. Pedal te saluda con una pata.',
        },
      ],
    },
  },

  streak_at_risk_mild: {
    priority: 3,
    mascotPose: 'stand',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Streak reminder',
          body: 'Your {streakCount}-day streak needs a ride today, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Hey {riderName}',
          body: 'Short ride, big deal. {streakCount} days riding. Do not let me ruin the spreadsheet.',
        },
        {
          id: 'v3',
          title: 'Small reminder',
          body: '{streakCount} days. {city} is right there. Just saying.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Reamintire streak',
          body: 'Streak-ul tău de {streakCount} zile are nevoie de o cursă azi, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Salut, {riderName}',
          body: 'O cursă scurtă, mare lucru. {streakCount} zile la rând. Să nu strici tabelul.',
        },
        {
          id: 'v3',
          title: 'Mică reamintire',
          body: '{streakCount} zile. {city} e chiar aici. Doar zic.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Recordatorio de racha',
          body: 'Tu racha de {streakCount} días necesita una ruta hoy, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Oye, {riderName}',
          body: 'Una ruta corta, gran cosa. {streakCount} días seguidos. No me dejes estropear la hoja de cálculo.',
        },
        {
          id: 'v3',
          title: 'Pequeño recordatorio',
          body: '{streakCount} días. {city} está ahí mismo. Solo digo.',
        },
      ],
    },
  },

  streak_at_risk_dramatic: {
    priority: 1,
    mascotPose: 'stand',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Streak ending soon',
          body: '{streakCount}-day streak ending soon. Time to ride, {riderName}.',
        },
        {
          id: 'v2',
          title: '{riderName}',
          body: '{streakCount} days. {city} is dry. I am sitting by the window. I am waiting.',
        },
        {
          id: 'v3',
          title: 'Pedal is concerned',
          body: '{streakCount} days riding. Today is the only thing between you and zero.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Streak-ul se termină',
          body: 'Streak-ul de {streakCount} zile se încheie curând. E momentul, {riderName}.',
        },
        {
          id: 'v2',
          title: '{riderName}',
          body: '{streakCount} zile. {city} e uscat. Stau lângă fereastră. Aștept.',
        },
        {
          id: 'v3',
          title: 'Pedal e îngrijorat',
          body: '{streakCount} zile pedalat. Azi e singurul lucru între tine și zero.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'La racha está a punto de acabar',
          body: 'Tu racha de {streakCount} días termina pronto. Hora de montar, {riderName}.',
        },
        {
          id: 'v2',
          title: '{riderName}',
          body: '{streakCount} días. {city} está seco. Estoy junto a la ventana. Estoy esperando.',
        },
        {
          id: 'v3',
          title: 'Pedal está preocupado',
          body: '{streakCount} días pedaleando. Hoy es lo único entre tú y el cero.',
        },
      ],
    },
  },

  daily_ride_reminder: {
    priority: 2,
    mascotPose: 'ride',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Ride window open',
          body: 'Your usual ride hour, {riderName}. Conditions look good in {city}.',
        },
        {
          id: 'v2',
          title: 'It is time',
          body: '{city} is calling. The bike is ready. So is Pedal.',
        },
        {
          id: 'v3',
          title: 'Quick check-in',
          body: 'Same time as yesterday, {riderName}? Pedal kept your spot warm.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Fereastră pentru cursă',
          body: 'Ora ta obișnuită, {riderName}. Condițiile arată bine în {city}.',
        },
        {
          id: 'v2',
          title: 'E momentul',
          body: '{city} cheamă. Bicicleta e gata. Pedal la fel.',
        },
        {
          id: 'v3',
          title: 'Verificare rapidă',
          body: 'La fel ca ieri, {riderName}? Ți-am păstrat locul cald.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Ventana para rodar',
          body: 'Tu hora habitual, {riderName}. Las condiciones pintan bien en {city}.',
        },
        {
          id: 'v2',
          title: 'Es la hora',
          body: '{city} te llama. La bici está lista. Pedal también.',
        },
        {
          id: 'v3',
          title: 'Chequeo rápido',
          body: '¿Misma hora que ayer, {riderName}? Pedal te guardó el sitio calentito.',
        },
      ],
    },
  },

  milestone_celebration: {
    priority: 0,
    mascotPose: 'trophy',
    variants: {
      en: [
        {
          id: 'v1',
          title: '{milestoneDay}-day streak',
          body: 'Milestone unlocked, {riderName}. {milestoneDay} days in a row.',
        },
        {
          id: 'v2',
          title: '{milestoneDay}. {milestoneDay}!',
          body: '{riderName}, you are officially a habit. I am getting a tattoo of you.',
        },
        {
          id: 'v3',
          title: 'Pedal pop quiz',
          body: 'What is {milestoneDay} days of riding? A movement. Welcome to it, {riderName}.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Streak de {milestoneDay} zile',
          body: 'Etapă deblocată, {riderName}. {milestoneDay} zile la rând.',
        },
        {
          id: 'v2',
          title: '{milestoneDay}. {milestoneDay}!',
          body: '{riderName}, ești oficial o obișnuință. Îmi fac un tatuaj cu tine.',
        },
        {
          id: 'v3',
          title: 'Pedal te întreabă',
          body: 'Ce sunt {milestoneDay} zile de pedalat? O mișcare. Bine ai venit, {riderName}.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Racha de {milestoneDay} días',
          body: 'Hito desbloqueado, {riderName}. {milestoneDay} días seguidos.',
        },
        {
          id: 'v2',
          title: '{milestoneDay}. ¡{milestoneDay}!',
          body: '{riderName}, eres oficialmente un hábito. Voy a tatuarme tu cara.',
        },
        {
          id: 'v3',
          title: 'Pregunta de Pedal',
          body: '¿Qué son {milestoneDay} días de rodar? Un movimiento. Bienvenido, {riderName}.',
        },
      ],
    },
  },

  badge_proximity: {
    priority: 2,
    mascotPose: 'climb',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'One ride away',
          body: 'One more ride unlocks {badgeLabel}, {riderName}.',
        },
        {
          id: 'v2',
          title: 'You are this close',
          body: '{badgeLabel} is one ride away. Pedal already wrote the speech.',
        },
        {
          id: 'v3',
          title: 'Almost there',
          body: 'Your next ride finishes {badgeLabel}. No pressure though.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'O cursă rămasă',
          body: 'O cursă în plus deblochează {badgeLabel}, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Ești atât de aproape',
          body: '{badgeLabel} e la o cursă. Pedal a scris deja discursul.',
        },
        {
          id: 'v3',
          title: 'Aproape gata',
          body: 'Următoarea cursă finalizează {badgeLabel}. Fără presiune.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'A una ruta',
          body: 'Una ruta más desbloquea {badgeLabel}, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Estás así de cerca',
          body: '{badgeLabel} está a una ruta. Pedal ya ha escrito el discurso.',
        },
        {
          id: 'v3',
          title: 'Casi lo tienes',
          body: 'Tu próxima ruta cierra {badgeLabel}. Sin presión, eh.',
        },
      ],
    },
  },

  lapsed_reengagement: {
    priority: 3,
    mascotPose: 'study',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Pedal misses you',
          body: '{lapsedDays} days. Your bike is where you left it, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Welfare check',
          body: 'I checked. The bike is still there. {city} is still there. Just saying.',
        },
        {
          id: 'v3',
          title: 'No pressure',
          body: 'Whenever you are ready, {riderName}. Pedal is patient.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Pedal te-așteaptă',
          body: '{lapsedDays} zile. Bicicleta e unde ai lăsat-o, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Verific tot e bine',
          body: 'Am verificat. Bicicleta e tot acolo. {city} la fel. Doar zic.',
        },
        {
          id: 'v3',
          title: 'Fără presiune',
          body: 'Când ești gata, {riderName}. Pedal are răbdare.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Pedal te echa de menos',
          body: '{lapsedDays} días. Tu bici sigue donde la dejaste, {riderName}.',
        },
        {
          id: 'v2',
          title: 'Comprobación de bienestar',
          body: 'Comprobado. La bici sigue ahí. {city} también. Solo digo.',
        },
        {
          id: 'v3',
          title: 'Sin presión',
          body: 'Cuando estés listo, {riderName}. Pedal es paciente.',
        },
      ],
    },
  },

  community_signal: {
    priority: 3,
    mascotPose: 'cheer',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Neighborhood update',
          body: '{city} riders are active. Your ranking moved.',
        },
        {
          id: 'v2',
          title: 'Heads up',
          body: 'Someone in {city} just hit a milestone. The neighborhood is moving.',
        },
        {
          id: 'v3',
          title: 'Local news',
          body: 'Activity is up in {city} this week. Pedal recommends joining in.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Cartierul tău',
          body: 'Cicliștii din {city} sunt activi. Clasamentul tău s-a schimbat.',
        },
        {
          id: 'v2',
          title: 'Atenție',
          body: 'Cineva din {city} tocmai a atins o etapă. Cartierul se mișcă.',
        },
        {
          id: 'v3',
          title: 'Știri locale',
          body: 'Activitatea crește în {city} săptămâna asta. Pedal recomandă să te alături.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Tu barrio',
          body: 'Los ciclistas de {city} están activos. Tu puesto en el ranking ha cambiado.',
        },
        {
          id: 'v2',
          title: 'Atención',
          body: 'Alguien en {city} acaba de alcanzar un hito. El barrio se mueve.',
        },
        {
          id: 'v3',
          title: 'Noticias locales',
          body: 'La actividad sube en {city} esta semana. Pedal recomienda unirse.',
        },
      ],
    },
  },

  streak_lost_apology: {
    priority: 0,
    mascotPose: 'stand',
    variants: {
      en: [
        {
          id: 'v1',
          title: 'Fresh start',
          body: 'Your streak reset. Ready for three days, {riderName}? Then we see.',
        },
        {
          id: 'v2',
          title: '{riderName}',
          body: 'About yesterday. Look. It happens. Want to try 3 days, no pressure? I keep it chill.',
        },
        {
          id: 'v3',
          title: 'Pedal regroup',
          body: 'Streak reset. Three rides, three days, soft restart. Pedal has your back.',
        },
      ],
      ro: [
        {
          id: 'v1',
          title: 'Reîncepem',
          body: 'Streak-ul s-a resetat. Gata pentru trei zile, {riderName}? Apoi vedem.',
        },
        {
          id: 'v2',
          title: '{riderName}',
          body: 'În legătură cu ieri. Se întâmplă. Vrei să încercăm 3 zile, fără presiune? Pedal păstrează calmul.',
        },
        {
          id: 'v3',
          title: 'Pedal reîncepe',
          body: 'Streak resetat. Trei curse, trei zile, restart lent. Pedal e cu tine.',
        },
      ],
      es: [
        {
          id: 'v1',
          title: 'Empezamos de nuevo',
          body: 'Tu racha se ha reseteado. ¿Listo para tres días, {riderName}? Luego vemos.',
        },
        {
          id: 'v2',
          title: '{riderName}',
          body: 'Sobre lo de ayer. Pasa. ¿Probamos 3 días, sin presión? Pedal lo lleva con calma.',
        },
        {
          id: 'v3',
          title: 'Pedal se reagrupa',
          body: 'Racha reseteada. Tres rutas, tres días, reinicio suave. Pedal está contigo.',
        },
      ],
    },
  },
};

// ---------------------------------------------------------------------------
// Variant assignment (sticky bucket)
// ---------------------------------------------------------------------------

/**
 * Deterministic, pure hash of (userId + triggerId) → integer.
 * djb2 variant — small, no deps, stable across server + client.
 * Returns a non-negative 32-bit integer.
 */
const hashKey = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

/**
 * Pick a variant index in [0, variantCount). Sticky across calls for the
 * same (userId, trigger) pair. Used so A/B groups stay stable per user.
 */
export const pickVariantIndex = (
  userId: string,
  trigger: NudgeTrigger,
  variantCount: number,
): number => {
  if (variantCount <= 0) return 0;
  return hashKey(`${userId}|${trigger}`) % variantCount;
};

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

const FALLBACKS: Record<keyof NudgeContext, { en: string; ro: string; es: string }> = {
  riderName: { en: 'rider', ro: 'prietene', es: 'ciclista' },
  streakCount: { en: '0', ro: '0', es: '0' },
  milestoneDay: { en: '0', ro: '0', es: '0' },
  city: { en: 'your city', ro: 'orașul tău', es: 'tu ciudad' },
  badgeLabel: { en: 'your next badge', ro: 'următoarea insignă', es: 'tu próxima insignia' },
  lapsedDays: { en: 'a few', ro: 'câteva', es: 'unos cuantos' },
};

const PLACEHOLDER_RE = /\{(riderName|streakCount|milestoneDay|city|badgeLabel|lapsedDays)\}/g;

const renderTemplate = (
  template: string,
  context: NudgeContext,
  locale: NudgeLocale,
): string =>
  template.replace(PLACEHOLDER_RE, (_, key: keyof NudgeContext) => {
    const value = context[key];
    if (value === undefined || value === null || value === '') {
      return FALLBACKS[key][locale];
    }
    return String(value);
  });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a fully-rendered Pedal nudge message. Deterministic given the same
 * inputs — safe to call from server cron or mobile P0 fast path.
 */
export const pickMessage = (req: PedalVoiceRequest): PedalVoiceMessage => {
  const catalog = CATALOG[req.trigger];
  const variants = catalog.variants[req.locale];

  // Neutral mode always renders variant index 0; sassy mode uses sticky-bucket.
  const index = req.sassy
    ? pickVariantIndex(req.userId, req.trigger, variants.length)
    : 0;

  // Safety guard — defensive, the catalog is statically sized so this should
  // never miss, but a NaN hash would be a silent disaster otherwise.
  const variant = variants[index] ?? variants[0]!;

  return {
    title: renderTemplate(variant.title, req.context, req.locale),
    body: renderTemplate(variant.body, req.context, req.locale),
    variantId: variant.id,
    mascotPose: catalog.mascotPose,
    priority: catalog.priority,
  };
};

/**
 * Helpers for the priority queue / eligibility layer to inspect a trigger
 * without rendering a full message.
 */
export const getTriggerPriority = (trigger: NudgeTrigger): NudgePriority =>
  CATALOG[trigger].priority;

export const getTriggerPose = (trigger: NudgeTrigger): MascotPose =>
  CATALOG[trigger].mascotPose;

/** All trigger IDs, ordered by priority (P0 → P3). Useful for the cron loop. */
export const TRIGGERS_BY_PRIORITY: readonly NudgeTrigger[] = Object.entries(
  CATALOG,
)
  .sort(([, a], [, b]) => a.priority - b.priority)
  .map(([id]) => id as NudgeTrigger);
