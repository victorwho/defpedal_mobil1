/**
 * Bike type identity.
 *
 * The rider's bike type drives three independent decisions — default surface
 * routing (`avoidUnpaved`), microlives multipliers, and calorie burn — so it
 * must be a STABLE id, never the localized label shown in the picker.
 *
 * It used to be the label. `setBikeType` compared against `'Road bike'` /
 * `'Mountain bike'`, `mapBikeTypeToVehicle` against `'e-bike'`, and the API
 * against `'ebike'` — all English — while the Profile picker stored
 * `t('profile.bikeRoad')`. A Romanian rider stored `'Bicicletă de cursă'`,
 * matched nothing, and silently got none of the three behaviours: no
 * avoid-unpaved default, acoustic microlives on an e-bike, and wrong
 * calories. Same for Spanish.
 *
 * `legacyBikeTypeToId` converts the labels already persisted on devices and
 * already written to `trip_tracks.bike_type`, so both keep working.
 */

export type BikeTypeId =
  | 'road'
  | 'city'
  | 'mountain'
  | 'ebike'
  | 'recumbent'
  | 'other';

/** Display order — shared by the Profile picker and the onboarding screen. */
export const BIKE_TYPE_IDS = [
  'road',
  'city',
  'mountain',
  'ebike',
  'recumbent',
  'other',
] as const satisfies readonly BikeTypeId[];

export const isBikeTypeId = (value: unknown): value is BikeTypeId =>
  typeof value === 'string' && (BIKE_TYPE_IDS as readonly string[]).includes(value);

/**
 * Bikes whose riders want to stay on tarmac — turning `avoidUnpaved` ON is
 * the helpful default.
 */
export const prefersPavedRouting = (id: BikeTypeId): boolean =>
  id === 'road' || id === 'city' || id === 'recumbent';

/**
 * Bikes built for rough surfaces — turning `avoidUnpaved` OFF opens up
 * routes the rider is equipped for.
 */
export const prefersUnpavedCapable = (id: BikeTypeId): boolean =>
  id === 'mountain';

/**
 * Resolve the `avoidUnpaved` value implied by a bike type.
 *
 * `null` means "this bike type implies nothing" (E-bike, Other) — the
 * caller must keep whatever the rider already chose. Returning null rather
 * than a boolean is deliberate: it makes "leave it alone" impossible to
 * confuse with "set it false".
 */
export const avoidUnpavedForBikeType = (id: BikeTypeId): boolean | null => {
  if (prefersPavedRouting(id)) return true;
  if (prefersUnpavedCapable(id)) return false;
  return null;
};

export const isEbikeType = (id: BikeTypeId): boolean => id === 'ebike';

// ── Legacy display-label mapping ────────────────────────────────────────

/**
 * Fold the diacritics used by our RO/ES labels.
 *
 * Written as an explicit map rather than `String.prototype.normalize('NFD')`
 * because this also runs on Hermes, where Unicode normalization support has
 * historically varied by build.
 */
const DIACRITIC_FOLD: Record<string, string> = {
  ă: 'a', â: 'a', á: 'a', à: 'a',
  î: 'i', í: 'i',
  ș: 's', ş: 's',
  ț: 't', ţ: 't',
  é: 'e', è: 'e',
  ó: 'o', ò: 'o',
  ú: 'u', ü: 'u',
  ñ: 'n',
};

const normalizeLabel = (raw: string): string =>
  raw
    .toLowerCase()
    .trim()
    .replace(/[ăâáàîíșşțţéèóòúüñ]/g, (ch) => DIACRITIC_FOLD[ch] ?? ch);

/**
 * Every label this app has ever persisted as `bikeType`, in all three
 * locales, plus the raw ids so the map is idempotent.
 *
 * Do NOT remove entries when a translation changes — old devices and old
 * `trip_tracks` rows still hold the previous wording.
 */
const LEGACY_LABEL_TO_ID: Record<string, BikeTypeId> = {
  // ids (idempotent)
  road: 'road', city: 'city', mountain: 'mountain',
  ebike: 'ebike', recumbent: 'recumbent', other: 'other',
  // en
  'road bike': 'road',
  'city bike': 'city',
  'mountain bike': 'mountain',
  'e-bike': 'ebike',
  electric: 'ebike',
  // ro
  'bicicleta de cursa': 'road',
  'bicicleta de oras': 'city',
  'bicicleta de munte': 'mountain',
  'bicicleta electrica': 'ebike',
  'bicicleta recumbent': 'recumbent',
  altele: 'other',
  // es
  'bicicleta de carretera': 'road',
  'bicicleta de ciudad': 'city',
  'bicicleta de montana': 'mountain',
  'bicicleta reclinada': 'recumbent',
  otra: 'other',
};

/**
 * Map a historical display label (any locale) to its stable id.
 * Returns null for anything unrecognised — callers must treat that as
 * "unknown", never as a default bike type.
 */
export const legacyBikeTypeToId = (
  raw: string | null | undefined,
): BikeTypeId | null => {
  if (!raw) return null;
  const key = normalizeLabel(raw);
  const direct = LEGACY_LABEL_TO_ID[key];
  if (direct) return direct;
  // Last-resort e-bike sniff: the one category whose miscategorisation
  // silently corrupts calories and microlives rather than just routing.
  if (key.includes('ebike') || key.includes('e-bike') || key.includes('electr')) {
    return 'ebike';
  }
  return null;
};

/**
 * True when a raw `bike_type` value (stable id OR any legacy localized
 * label) denotes an e-bike. This is the single predicate the API and the
 * microlives engine share.
 */
export const isEbikeBikeTypeValue = (raw: string | null | undefined): boolean =>
  legacyBikeTypeToId(raw) === 'ebike';
