import type { MeasurementSystem } from './units';
import { formatDistance } from './formatters';

export type ShareCaptionInput =
  | {
      type: 'ride';
      distanceKm: number;
      durationMinutes: number;
      co2SavedKg: number;
      safetyScore?: number;
      microlivesGained?: number;
    }
  | {
      type: 'milestone';
      milestoneTitle: string;
      milestoneValue: string;
    }
  | {
      type: 'badge';
      badgeName: string;
      tier?: string;
      rarity?: string;
    };

const BASE_HASHTAGS = '#DefensivePedal';
const RIDE_HASHTAGS = `${BASE_HASHTAGS} #SaferCycling`;

/**
 * Public Play Store install URL for the production app. Appended to every
 * shareable caption so recipients without the app installed have a one-tap
 * path to install it. The `pcampaignid=web_share` query param is Google's
 * canonical attribution suffix for share-driven installs and lights up the
 * "Share" install source in Play Console.
 */
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.defensivepedal.mobile&pcampaignid=web_share';

/** App Store numeric id (ASC "Apple ID") for the iOS app. */
export const IOS_APP_STORE_ID = '6778694757';

/**
 * Canonical App Store listing URL for a given storefront.
 *
 * ⚠️ The country segment is REQUIRED, and that is measured rather than stylistic.
 * The app's availability matches its supported markets (EU-27 + EEA + CH + UK)
 * and it is deliberately NOT sold in the United States — Apple's iTunes lookup
 * returns `resultCount: 0` for `country=us`. A country-less
 * `https://apps.apple.com/app/id<id>` resolves to the US storefront and
 * therefore **404s**, verified 2026-09-26, as does an explicit `/us/` path.
 * `/ro/` and `/gb/` both return 200.
 *
 * So never link to the bare form: it is broken for every visitor, not just
 * American ones. Pass the visitor's storefront, falling back to a supported
 * English-language one.
 */
export const appStoreUrl = (countryCode = 'gb'): string =>
  `https://apps.apple.com/${countryCode.toLowerCase()}/app/defensive-pedal/id${IOS_APP_STORE_ID}`;

/**
 * Rounds to 1 decimal place, returning a string without a trailing ".0"
 * unless the input has a fractional part. Keeps output compact in captions.
 */
const round1 = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toString();
};

/**
 * Ride distance in the rider's own units, keeping this file's rule that a
 * caption carries no decimal it has not earned: "10 km", not "10.0 km".
 */
const captionDistance = (distanceKm: number, units: MeasurementSystem): string =>
  formatDistance(distanceKm * 1000, units).replace(/\.0(?= )/, '');

/**
 * Rounds to the nearest whole number and returns a string.
 */
const roundInt = (value: number): string => String(Math.round(value));

/**
 * Builds a human-readable English caption for sharing a ride, milestone,
 * or badge. Output is intentionally short so it fits Instagram, Twitter,
 * and WhatsApp status limits without truncation.
 *
 * All output is English regardless of device or app locale — share images
 * are crossposted, and a mixed-language caption reads badly.
 *
 * Numeric formatting:
 *   - distanceKm  → the rider's own units (1 decimal), unit included
 *   - durationMinutes → whole number
 *   - co2SavedKg → 1 decimal
 */
export function buildShareCaption(
  input: ShareCaptionInput,
  units: MeasurementSystem = 'metric',
): string {
  switch (input.type) {
    case 'ride': {
      const { distanceKm, durationMinutes, co2SavedKg, safetyScore, microlivesGained } = input;
      const parts = [
        `I just rode ${captionDistance(distanceKm, units)} in ${roundInt(durationMinutes)} min on Defensive Pedal.`,
        `${round1(co2SavedKg)} kg CO₂ saved.`,
      ];

      const hashtags = [RIDE_HASHTAGS];
      if (typeof safetyScore === 'number') {
        hashtags.push(`#SafetyScore${roundInt(safetyScore)}`);
      }
      if (typeof microlivesGained === 'number' && microlivesGained > 0) {
        hashtags.push('#LifeEarned');
      }

      return `${parts.join(' ')} ${hashtags.join(' ')} ${PLAY_STORE_URL}`;
    }

    case 'milestone': {
      const { milestoneTitle, milestoneValue } = input;
      return `Unlocked the ${milestoneTitle} milestone on Defensive Pedal (${milestoneValue}). ${BASE_HASHTAGS} ${PLAY_STORE_URL}`;
    }

    case 'badge': {
      const { badgeName, tier, rarity } = input;
      const suffixParts: string[] = [];
      if (tier) suffixParts.push(tier);
      if (rarity) suffixParts.push(rarity);
      const suffix = suffixParts.length > 0 ? ` — ${suffixParts.join(' · ')}` : '';
      return `Just earned the ${badgeName} badge on Defensive Pedal${suffix}. ${BASE_HASHTAGS} ${PLAY_STORE_URL}`;
    }
  }
}
