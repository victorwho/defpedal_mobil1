/**
 * Pedal voice charter — message catalog + variant selection.
 *
 * Pure functions only — no I/O, no clock side effects. The caller supplies
 * a context (rider name, streak count, city, locale, sassy/neutral, userId
 * for rotation seeding) and gets back a rendered message.
 *
 * Voice rules (locked in plan section 6.1):
 *   1. Witty, never cruel. Pedal teases but doesn't insult.
 *   2. Self-aware mascot — Pedal can break the fourth wall.
 *   3. Cycling-knowledgeable. References rider's neighborhood / streak.
 *   4. No emoji as load-bearing semantics. Pedal pose carries the visual.
 *   5. RO register is slightly more formal but stays cheeky.
 *
 * Catalog shape (since 2026-08-13): each trigger has VOICE-KEYED pools per
 * locale — 12 sassy variants (`v1`..`v12`) and 6 neutral variants
 * (`n1`..`n6`) — in pedalVoiceCatalog.{en,ro,es}.ts. BOTH voices rotate
 * per send: djb2(userId|trigger|sendDate) seeds the pick, then the
 * rotation walks past any variant the user received recently
 * (`recentVariantIds`, read back from nudge_log by the dispatcher) — a
 * rider never hears the same line twice in a row. Do NOT reintroduce
 * per-user sticky assignment: it pins one phrase per rider for life,
 * which on the per-ride P0 triggers meant the same joke on every single
 * ride (and neutral's old always-v1 rule was the same defect in disguise).
 * Per-send A/B analysis still works via nudge_log.variant_id.
 */

import type { MascotPose } from './mascotPose';
import { EN_CATALOG } from './pedalVoiceCatalog.en';
import { RO_CATALOG } from './pedalVoiceCatalog.ro';
import { ES_CATALOG } from './pedalVoiceCatalog.es';
import type {
  CatalogNudgeTrigger,
  LocaleCatalog,
  NudgeLocale,
  NudgePriority,
  NudgeTrigger,
  VariantTemplate,
  VoicePools,
} from './pedalVoiceTypes';

export type {
  CatalogNudgeTrigger,
  LocaleCatalog,
  NudgeLocale,
  NudgePriority,
  NudgeTrigger,
  VariantTemplate,
  VoicePools,
} from './pedalVoiceTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NudgeContext {
  readonly riderName?: string;
  readonly streakCount?: number;
  readonly milestoneDay?: number;
  readonly city?: string;
  readonly badgeLabel?: string;
  readonly lapsedDays?: number;
  /** city_riders_pulse — the synthetic rider count rendered as {n}. */
  readonly n?: number;
  /** city_riders_pulse telemetry only (nudge_log.context) — never rendered. */
  readonly rate?: number;
  /** city_riders_pulse telemetry only (nudge_log.context) — never rendered. */
  readonly weatherFactor?: number;
  /**
   * city_riders_pulse telemetry only — mirror of the nudge_log.variant_id
   * column inside context, used by the per-send rotation lookback.
   */
  readonly variantId?: string;
}

export interface PedalVoiceRequest {
  readonly trigger: NudgeTrigger;
  readonly locale: NudgeLocale;
  readonly context: NudgeContext;
  /** Profile setting — false renders from the neutral pool. */
  readonly sassy: boolean;
  /** Required — seeds the per-send rotation hash. */
  readonly userId: string;
  /**
   * The send date ("YYYY-MM-DD") feeding the per-send rotation hash for
   * EVERY trigger. The dispatcher fills it in; omitting it just weakens
   * the rotation seed (recentVariantIds still prevents repeats).
   */
  readonly sendDateISO?: string;
  /**
   * The last variant ids actually sent to this user for the trigger (most
   * recent first, from nudge_log). The rotation skips them — clamped to
   * variantCount - 1 for small pools — so the same line never repeats
   * twice in a row. Applies to every trigger and both voices (the sassy
   * `v*` / neutral `n*` id namespaces are disjoint, so history from the
   * other voice is inert); the dispatcher fetches this when the caller
   * doesn't supply it.
   */
  readonly recentVariantIds?: readonly string[];
}

export interface PedalVoiceMessage {
  readonly title: string;
  readonly body: string;
  readonly variantId: string;
  readonly mascotPose: MascotPose;
  readonly priority: NudgePriority;
}

// ---------------------------------------------------------------------------
// Catalog assembly
// ---------------------------------------------------------------------------

/** Pool sizes — locked by the catalog-completeness tests. */
export const CATALOG_SASSY_VARIANT_COUNT = 12;
export const CATALOG_NEUTRAL_VARIANT_COUNT = 6;

interface TriggerMeta {
  readonly priority: NudgePriority;
  readonly mascotPose: MascotPose;
}

/** Locale-independent trigger metadata (copy lives in the locale files). */
const TRIGGER_META: Record<CatalogNudgeTrigger, TriggerMeta> = {
  post_ride_celebration: { priority: 0, mascotPose: 'cheer' },
  post_hazard_thanks: { priority: 0, mascotPose: 'cheer' },
  streak_at_risk_mild: { priority: 3, mascotPose: 'stand' },
  streak_at_risk_dramatic: { priority: 1, mascotPose: 'stand' },
  daily_ride_reminder: { priority: 2, mascotPose: 'ride' },
  milestone_celebration: { priority: 0, mascotPose: 'trophy' },
  badge_proximity: { priority: 2, mascotPose: 'climb' },
  lapsed_reengagement: { priority: 3, mascotPose: 'study' },
  community_signal: { priority: 3, mascotPose: 'cheer' },
  streak_lost_apology: { priority: 0, mascotPose: 'stand' },
};

const LOCALE_CATALOGS: Record<NudgeLocale, LocaleCatalog> = {
  en: EN_CATALOG,
  ro: RO_CATALOG,
  es: ES_CATALOG,
};

/**
 * Read-only pool accessor for tests and audit tooling — iterate every
 * variant without reaching through pickMessage's rotation.
 */
export const getCatalogPools = (
  trigger: CatalogNudgeTrigger,
  locale: NudgeLocale,
): VoicePools => LOCALE_CATALOGS[locale][trigger];

// ---------------------------------------------------------------------------
// Variant assignment (per-send rotation)
// ---------------------------------------------------------------------------

/**
 * Deterministic, pure hash of an arbitrary string → integer.
 * djb2 variant — small, no deps, stable across server + client.
 * Returns a non-negative 32-bit integer.
 *
 * Exported as THE project hash for deterministic seeding (rotation seeds
 * here, city/date seeding in cityPulse.ts) — reuse it, don't add another.
 */
export const djb2Hash = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

/**
 * How many recently-sent variants the per-send rotation refuses to repeat.
 * The dispatcher's nudge_log lookback LIMIT rides on this constant — raise
 * or lower them together by editing here only. Clamped to variantCount - 1
 * for small pools: the 6-variant neutral pools get an effective memory of
 * 5 (strict full-cycle rotation — every line fires once before any
 * repeats); the 12-variant sassy pools use the full 6, so no line returns
 * within 6 sends.
 */
export const CATALOG_ROTATION_MEMORY = 6;

/**
 * Per-send rotation for catalog triggers: base index from
 * djb2(userId|trigger|sendDate), then walk forward past any variant id the
 * user already received recently. Always terminates — the memory is
 * clamped below the pool size, so at least one variant survives the skip.
 */
const pickCatalogIndex = (
  userId: string,
  trigger: NudgeTrigger,
  variants: readonly VariantTemplate[],
  sendDateISO: string | undefined,
  recentVariantIds: readonly string[] | undefined,
): number => {
  const count = variants.length;
  if (count <= 1) return 0;
  const base = djb2Hash(`${userId}|${trigger}|${sendDateISO ?? ''}`) % count;
  const memory = Math.min(count - 1, CATALOG_ROTATION_MEMORY);
  const recent = new Set((recentVariantIds ?? []).slice(0, memory));
  for (let step = 0; step < count; step++) {
    const index = (base + step) % count;
    if (!recent.has(variants[index]!.id)) return index;
  }
  return base;
};

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

/** Keys that may appear as {placeholders} in catalog templates. */
type PlaceholderKey =
  | 'riderName'
  | 'streakCount'
  | 'milestoneDay'
  | 'city'
  | 'badgeLabel'
  | 'lapsedDays'
  | 'n';

const FALLBACKS: Record<PlaceholderKey, { en: string; ro: string; es: string }> = {
  riderName: { en: 'rider', ro: 'prietene', es: 'ciclista' },
  streakCount: { en: '0', ro: '0', es: '0' },
  milestoneDay: { en: '0', ro: '0', es: '0' },
  city: { en: 'your city', ro: 'orașul tău', es: 'tu ciudad' },
  badgeLabel: { en: 'your next badge', ro: 'următoarea insignă', es: 'tu próxima insignia' },
  lapsedDays: { en: 'a few', ro: 'câteva', es: 'unos cuantos' },
  // "dozens of people…" / "zeci de oameni…" stay grammatical mid-sentence if
  // the count ever goes missing — the raw {n} must never leak.
  n: { en: 'dozens of', ro: 'zeci', es: 'decenas de' },
};

const PLACEHOLDER_RE = /\{(riderName|streakCount|milestoneDay|city|badgeLabel|lapsedDays|n)\}/g;

const renderTemplate = (
  template: string,
  context: NudgeContext,
  locale: NudgeLocale,
): string =>
  template.replace(PLACEHOLDER_RE, (_, key: PlaceholderKey) => {
    const value = context[key];
    if (value === undefined || value === null || value === '') {
      return FALLBACKS[key][locale];
    }
    return String(value);
  });

// ---------------------------------------------------------------------------
// City Riders Pulse catalog (per-send rotation, NOT sticky-bucket)
// ---------------------------------------------------------------------------

/**
 * 3 locales × 2 voices × 20 variants. EN + RO are verbatim from the plan doc
 * (docs/plans/city-riders-pulse-notification.md §Copy); ES was authored
 * 2026-08-13 (review finding G-24) in the same register as
 * pedalVoiceCatalog.es.ts. Unlike every other trigger, variety is the point
 * here: variant = djb2(userId + sendDate) % 20, skipping the last 3 variant
 * ids the user saw. Voice (sassy/neutral) stays sticky via the
 * pedal_voice_sassy toggle, as everywhere else.
 *
 * Pools are index-aligned across locales — the rotation picks an index and
 * the locale only decides which string that index renders, so all three
 * pools must stay the same length (locked by test).
 *
 * RO grammar: every variant uses "{n} de …", correct because N is floored at
 * 40 (the "de" article is required for numbers >= 20). ES needs no such
 * article, and its {n} fallback ("decenas de") reads correctly mid-sentence
 * in every variant.
 */
const CITY_PULSE_PRIORITY: NudgePriority = 3;
const CITY_PULSE_POSE: MascotPose = 'ride';

const CITY_PULSE_TITLES: Record<NudgeLocale, string> = {
  en: 'Riders out in {city}',
  ro: 'Bicicliști în {city}',
  es: 'Ciclistas en {city}',
};

const CITY_PULSE_BODIES: Record<NudgeLocale, { sassy: readonly string[]; neutral: readonly string[] }> = {
  en: {
    sassy: [
      '🚴 {n} people are cycling in {city} today. The bike lane is starting to ask about you. — Pedal',
      '{n} riders out in {city} right now. Your bike noticed.',
      '{city} count today: {n} cyclists, 1 suspiciously parked bike. Yours.',
      '{n} people in {city} chose the bike today. Peer pressure, but make it healthy.',
      'Breaking: {n} cyclists in {city} today. Witnesses report one bike still indoors. — Pedal',
      'Your city is at {n} cyclists today. You could make it {n}+1. Just saying.',
      '{n} people cycling in {city} and not one of them is you. Fixable.',
      'The streets of {city}: {n} bikes strong today. Room for one more.',
      '{n} riders in {city} today. Your saddle is filing a missing person report.',
      "Everyone's doing it. Well, {n} people in {city} are. — Pedal",
      '{n} cyclists out in {city}. The weather did its part. Your move.',
      'Today in {city}: {n} people remembered they own a bike. Ring a bell?',
      '{n} riders rolling through {city} right now. FOMO is a renewable resource.',
      'Psst. {n} people are pedaling around {city} today. This is your sign.',
      '{city} leaderboard of the day: {n} cyclists. Currently missing: you.',
      '{n} bikes out in {city} today and yours is still doing wall duty.',
      "Fun fact: {n} people in {city} are cycling today. Less fun fact: you're reading this on a couch.",
      "{n} cyclists in {city} can't all be wrong. — Pedal",
      "Today's {city} forecast: {n} cyclists with a chance of you.",
      '{n} people out riding in {city}. Your helmet misses your head. — Pedal',
    ],
    neutral: [
      '{n} people are cycling in {city} today. Good day to join them?',
      '{n} people are cycling in {city} today. Join them?',
      '{n} riders are out in {city} today — a good moment for a ride.',
      'Cycling is busy in {city}: {n} riders out today.',
      '{n} people chose the bike in {city} today. Fancy a ride?',
      "It's a big cycling day in {city} — {n} riders out.",
      "{n} cyclists are on {city}'s streets today. Care to join?",
      'Today {n} people are riding in {city}. Your bike is ready when you are.',
      '{n} riders in {city} today. A short ride still counts.',
      '{city} has {n} cyclists out today. Good conditions for a ride.',
      '{n} people are pedaling around {city} today. Join in when you can.',
      'Lots of company out there: {n} cyclists in {city} today.',
      "{n} riders took to {city}'s streets today. Room for one more.",
      'Cycling update: {n} people riding in {city} today.',
      '{n} people in {city} are on their bikes today. How about a quick loop?',
      "Today's count for {city}: {n} cyclists. Join the ride?",
      '{n} riders are out enjoying {city} today. You could be too.',
      'A good day on two wheels — {n} cyclists out in {city}.',
      '{n} people are riding in {city} right now. A ride today keeps the streak alive.',
      '{city} is busy with bikes: {n} riders today. Join them?',
    ],
  },
  ro: {
    sassy: [
      '🚴 {n} de oameni pedalează azi prin {city}. Doar tu lipsești. — Pedal',
      '{n} de bicicliști azi în {city}. Bicicleta ta a observat că stai.',
      'Numărătoarea zilei în {city}: {n} de bicicliști și o bicicletă parcată suspect. A ta.',
      '{n} de oameni din {city} au ales azi bicicleta. Presiune de grup, dar sănătoasă.',
      'Știrea zilei: {n} de bicicliști în {city}. Una singură stă în casă. — Pedal',
      '{city} e la {n} de bicicliști azi. Tu poți face {n}+1.',
      '{n} de oameni pedalează prin {city} și niciunul nu ești tu. Se rezolvă.',
      'Străzile din {city}: {n} de biciclete azi. Mai e loc de una.',
      '{n} de bicicliști azi în {city}. Șaua ta a depus plângere de abandon.',
      'Toată lumea o face. Mă rog, {n} de oameni din {city}. — Pedal',
      '{n} de bicicliști prin {city}. Vremea și-a făcut treaba. E rândul tău.',
      'Azi în {city}: {n} de oameni și-au amintit că au bicicletă. Îți sună cunoscut?',
      '{n} de bicicliști se plimbă acum prin {city}. FOMO-ul e resursă regenerabilă.',
      'Psst. {n} de oameni pedalează azi prin {city}. Ăsta e semnul tău.',
      'Clasamentul zilei în {city}: {n} de bicicliști. Lipsește: tu.',
      '{n} de biciclete pe străzi în {city}, iar a ta ține peretele.',
      'Fapt amuzant: {n} de oameni pedalează azi în {city}. Mai puțin amuzant: tu citești asta de pe canapea.',
      '{n} de bicicliști din {city} nu pot greși toți. — Pedal',
      'Prognoza zilei pentru {city}: {n} de bicicliști, cu șanse de tine.',
      '{n} de oameni pe biciclete în {city}. Casca ta ți-a simțit lipsa. — Pedal',
    ],
    neutral: [
      '{n} de oameni pedalează azi în {city}. O zi bună pentru o tură?',
      '{n} de oameni merg azi cu bicicleta prin {city}. Li te alături?',
      '{n} de bicicliști sunt azi pe străzile din {city} — un moment bun pentru o plimbare.',
      'E zi plină pentru ciclism în {city}: {n} de bicicliști azi.',
      '{n} de oameni au ales azi bicicleta în {city}. Ai chef de o tură?',
      'Azi e o zi mare pentru biciclete în {city} — {n} de bicicliști.',
      '{n} de bicicliști pe străzile din {city} azi. Te alături?',
      'Azi {n} de oameni pedalează în {city}. Bicicleta ta e pregătită.',
      '{n} de bicicliști azi în {city}. Și o tură scurtă contează.',
      '{city} are azi {n} de bicicliști pe străzi. Condiții bune de mers.',
      '{n} de oameni pedalează azi prin {city}. Alătură-te când poți.',
      'Multă companie afară: {n} de bicicliști azi în {city}.',
      '{n} de bicicliști au ieșit azi pe străzile din {city}. Mai e loc de unul.',
      'Actualizare ciclism: {n} de oameni pedalează azi în {city}.',
      '{n} de oameni din {city} sunt azi pe bicicletă. Ce zici de o tură scurtă?',
      'Numărătoarea de azi pentru {city}: {n} de bicicliști. Te alături?',
      '{n} de bicicliști se bucură azi de {city}. Ai putea fi și tu printre ei.',
      'O zi bună pe două roți — {n} de bicicliști în {city}.',
      '{n} de oameni pedalează chiar acum în {city}. O tură azi îți ține seria activă.',
      '{city} e plin de biciclete: {n} de bicicliști azi. Li te alături?',
    ],
  },
  es: {
    sassy: [
      '{n} personas pedalean hoy por {city}. El carril bici ya pregunta por ti. — Pedal',
      '{n} ciclistas por {city} ahora mismo. Tu bici se ha dado cuenta.',
      'Recuento de hoy en {city}: {n} ciclistas y una bici aparcada de forma sospechosa. La tuya.',
      '{n} personas de {city} han elegido hoy la bici. Presión de grupo, pero de la sana.',
      'Última hora: {n} ciclistas hoy en {city}. Testigos afirman que una bici sigue en casa. — Pedal',
      '{city} va por {n} ciclistas hoy. Tú podrías sumar uno más. Solo digo.',
      '{n} personas pedalean por {city} y ninguna eres tú. Tiene arreglo.',
      'Las calles de {city}: {n} bicis hoy. Cabe una más.',
      '{n} ciclistas hoy en {city}. Tu sillín ha puesto una denuncia por abandono.',
      'Lo hace todo el mundo. Bueno, {n} personas de {city}. — Pedal',
      '{n} ciclistas por {city}. El tiempo ha cumplido. Te toca.',
      'Hoy en {city}: {n} personas se han acordado de que tienen bici. ¿Te suena?',
      '{n} ciclistas rodando por {city} ahora mismo. El FOMO es un recurso renovable.',
      'Psst. {n} personas pedalean hoy por {city}. Esta es tu señal.',
      'Clasificación del día en {city}: {n} ciclistas. Ausente: tú.',
      '{n} bicis por {city} hoy y la tuya sigue sujetando la pared.',
      'Dato curioso: {n} personas pedalean hoy en {city}. Dato menos curioso: tú lees esto en el sofá.',
      '{n} ciclistas de {city} no pueden estar todos equivocados. — Pedal',
      'Previsión de hoy para {city}: {n} ciclistas con probabilidad de ti.',
      '{n} personas rodando por {city}. Tu casco echa de menos tu cabeza. — Pedal',
    ],
    neutral: [
      '{n} personas pedalean hoy por {city}. ¿Buen día para unirte?',
      '{n} personas van hoy en bici por {city}. ¿Te unes?',
      '{n} ciclistas están hoy por {city}: buen momento para una ruta.',
      'Día movido de ciclismo en {city}: {n} ciclistas hoy.',
      '{n} personas han elegido hoy la bici en {city}. ¿Te apetece una ruta?',
      'Hoy es un gran día ciclista en {city}: {n} ciclistas fuera.',
      '{n} ciclistas ruedan hoy por las calles de {city}. ¿Te unes?',
      'Hoy {n} personas pedalean por {city}. Tu bici está lista cuando tú lo estés.',
      '{n} ciclistas hoy en {city}. Una ruta corta también cuenta.',
      '{city} tiene hoy {n} ciclistas en la calle. Buenas condiciones para rodar.',
      '{n} personas pedalean hoy por {city}. Únete cuando puedas.',
      'Hay buena compañía ahí fuera: {n} ciclistas hoy en {city}.',
      '{n} ciclistas han salido hoy a las calles de {city}. Cabe una más.',
      'Actualización ciclista: {n} personas pedalean hoy en {city}.',
      '{n} personas de {city} están hoy en bici. ¿Qué tal una vuelta rápida?',
      'Recuento de hoy en {city}: {n} ciclistas. ¿Te unes?',
      '{n} ciclistas disfrutan hoy de {city}. Tú también podrías.',
      'Un buen día sobre dos ruedas: {n} ciclistas por {city}.',
      '{n} personas pedalean ahora mismo por {city}. Una ruta hoy mantiene viva tu racha.',
      '{city} está lleno de bicis: {n} ciclistas hoy. ¿Te unes?',
    ],
  },
};

export const CITY_PULSE_VARIANT_COUNT = 20;
/** How many recently-shown variants the rotation refuses to repeat. */
export const CITY_PULSE_ROTATION_MEMORY = 3;

/**
 * Read-only City Pulse pool accessor for tests and audit tooling — the
 * counterpart of `getCatalogPools` for the trigger that keeps its own
 * catalog.
 */
export const getCityPulsePools = (
  locale: NudgeLocale,
): { readonly title: string; readonly sassy: readonly string[]; readonly neutral: readonly string[] } => ({
  title: CITY_PULSE_TITLES[locale],
  sassy: CITY_PULSE_BODIES[locale].sassy,
  neutral: CITY_PULSE_BODIES[locale].neutral,
});

const cityPulseVariantId = (voice: 'sassy' | 'neutral', index: number): string =>
  `${voice}-v${index + 1}`;

/**
 * Per-send rotation: base index = djb2(userId + "|" + sendDate) % 20, then
 * walk forward past any of the last 3 variant ids already shown. Always
 * terminates (20 variants, at most 3 skips).
 */
const pickCityPulseIndex = (
  userId: string,
  sendDateISO: string,
  voice: 'sassy' | 'neutral',
  recentVariantIds: readonly string[],
): number => {
  const base = djb2Hash(`${userId}|${sendDateISO}`) % CITY_PULSE_VARIANT_COUNT;
  const recent = new Set(recentVariantIds.slice(0, CITY_PULSE_ROTATION_MEMORY));
  for (let step = 0; step < CITY_PULSE_VARIANT_COUNT; step++) {
    const index = (base + step) % CITY_PULSE_VARIANT_COUNT;
    if (!recent.has(cityPulseVariantId(voice, index))) return index;
  }
  return base;
};

const pickCityPulseMessage = (req: PedalVoiceRequest): PedalVoiceMessage => {
  const locale = req.locale;
  const voice = req.sassy ? 'sassy' : 'neutral';
  const index = pickCityPulseIndex(
    req.userId,
    req.sendDateISO ?? '',
    voice,
    req.recentVariantIds ?? [],
  );
  const body = CITY_PULSE_BODIES[locale][voice][index] ?? CITY_PULSE_BODIES[locale][voice][0]!;

  return {
    title: renderTemplate(CITY_PULSE_TITLES[locale], req.context, locale),
    body: renderTemplate(body, req.context, locale),
    variantId: cityPulseVariantId(voice, index),
    mascotPose: CITY_PULSE_POSE,
    priority: CITY_PULSE_PRIORITY,
  };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a fully-rendered Pedal nudge message. Deterministic given the same
 * inputs — safe to call from server cron or mobile P0 fast path.
 */
export const pickMessage = (req: PedalVoiceRequest): PedalVoiceMessage => {
  // city_riders_pulse keeps its own 20-variant voice-prefixed rotation.
  if (req.trigger === 'city_riders_pulse') {
    return pickCityPulseMessage(req);
  }

  const pools = LOCALE_CATALOGS[req.locale][req.trigger];
  // Both voices rotate through their own pool — neutral riders stopped
  // getting one pinned line when the neutral pools shipped (2026-08-13).
  const variants = req.sassy ? pools.sassy : pools.neutral;
  const index = pickCatalogIndex(
    req.userId,
    req.trigger,
    variants,
    req.sendDateISO,
    req.recentVariantIds,
  );

  // Safety guard — defensive, the catalog is statically sized so this should
  // never miss, but a NaN hash would be a silent disaster otherwise.
  const variant = variants[index] ?? variants[0]!;
  const meta = TRIGGER_META[req.trigger];

  return {
    title: renderTemplate(variant.title, req.context, req.locale),
    body: renderTemplate(variant.body, req.context, req.locale),
    variantId: variant.id,
    mascotPose: meta.mascotPose,
    priority: meta.priority,
  };
};

/**
 * Helpers for the priority queue / eligibility layer to inspect a trigger
 * without rendering a full message.
 */
export const getTriggerPriority = (trigger: NudgeTrigger): NudgePriority =>
  trigger === 'city_riders_pulse' ? CITY_PULSE_PRIORITY : TRIGGER_META[trigger].priority;

export const getTriggerPose = (trigger: NudgeTrigger): MascotPose =>
  trigger === 'city_riders_pulse' ? CITY_PULSE_POSE : TRIGGER_META[trigger].mascotPose;

/**
 * All trigger IDs, ordered by priority (P0 → P3). Useful for the cron loop.
 * city_riders_pulse sits last within P3 (stable sort) — the ambient
 * social-proof ping loses every tie on purpose.
 */
export const TRIGGERS_BY_PRIORITY: readonly NudgeTrigger[] = (
  [
    ...Object.entries(TRIGGER_META).map(
      ([id, m]) => [id as NudgeTrigger, m.priority] as const,
    ),
    ['city_riders_pulse', CITY_PULSE_PRIORITY] as const,
  ] as ReadonlyArray<readonly [NudgeTrigger, NudgePriority]>
)
  .slice()
  .sort((a, b) => a[1] - b[1])
  .map(([id]) => id);
