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

/**
 * Rounds to 1 decimal place, returning a string without a trailing ".0"
 * unless the input has a fractional part. Keeps output compact in captions.
 */
const round1 = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toString();
};

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
 *   - distanceKm  → 1 decimal
 *   - durationMinutes → whole number
 *   - co2SavedKg → 1 decimal
 */
export function buildShareCaption(input: ShareCaptionInput): string {
  switch (input.type) {
    case 'ride': {
      const { distanceKm, durationMinutes, co2SavedKg, safetyScore, microlivesGained } = input;
      const parts = [
        `I just rode ${round1(distanceKm)} km in ${roundInt(durationMinutes)} min on Defensive Pedal.`,
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
