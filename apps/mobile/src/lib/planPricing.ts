/**
 * Secondary pricing figures for the Pedal Plus paywall — derived, never typed.
 *
 * The billed amount a rider sees is always the store's own `priceString`
 * (App Store Review Guideline 3.1.2 requires the billed amount to be the most
 * prominent price). These helpers produce only the SUBORDINATE figures: the
 * annual plan's per-month equivalent and its saving over twelve monthly
 * payments. Both are omitted rather than guessed when the store did not send
 * a numeric price, or when the two plans are in different currencies.
 */
import type { StoreOffer } from './purchases';

/** Below this, "Save X%" is not worth a badge. */
export const MIN_ADVERTISED_SAVING_PERCENT = 5;

/**
 * Saving of the annual plan over 12 monthly payments, in whole percent.
 * Rounded DOWN so the badge can never overstate the discount.
 */
export const annualSavingsPercent = (
  monthly: Pick<StoreOffer, 'price' | 'currencyCode'> | null,
  annual: Pick<StoreOffer, 'price' | 'currencyCode'> | null,
): number | null => {
  if (!monthly?.price || !annual?.price) return null;
  if (!monthly.currencyCode || monthly.currencyCode !== annual.currencyCode) return null;
  const percent = Math.floor((1 - annual.price / (monthly.price * 12)) * 100);
  return percent >= MIN_ADVERTISED_SAVING_PERCENT ? percent : null;
};

/** The annual price spread over twelve months, formatted in the rider's locale. */
export const annualPerMonthString = (
  annual: Pick<StoreOffer, 'price' | 'currencyCode'> | null,
  localeTag: string,
): string | null => {
  if (!annual?.price || !annual.currencyCode) return null;
  try {
    return new Intl.NumberFormat(localeTag, {
      style: 'currency',
      currency: annual.currencyCode,
      // A formatter rounds half-up, so truncate to the cent first: the
      // per-month figure must never read higher than the bill over twelve.
      maximumFractionDigits: 2,
    }).format(Math.floor((annual.price / 12) * 100) / 100);
  } catch {
    return null;
  }
};
