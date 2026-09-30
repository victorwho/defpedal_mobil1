import { describe, expect, it } from 'vitest';

import { annualPerMonthString, annualSavingsPercent } from './planPricing';

const eur = (price: number) => ({ price, currencyCode: 'EUR' });

describe('annualSavingsPercent', () => {
  it('computes the live Play prices as 16%, rounded down', () => {
    // EUR 35.99 against 12 x 3.59 = 43.08 -> 16.45% -> 16.
    expect(annualSavingsPercent(eur(3.59), eur(35.99))).toBe(16);
  });

  it('never rounds a saving up', () => {
    // 1 - 32.3/36 = 10.27% -> 10, not 11.
    expect(annualSavingsPercent(eur(3), eur(32.3))).toBe(10);
  });

  it('is omitted below the advertising floor', () => {
    expect(annualSavingsPercent(eur(3), eur(35))).toBeNull();
  });

  it('is omitted when a price is missing or the currencies differ', () => {
    expect(annualSavingsPercent(null, eur(35.99))).toBeNull();
    expect(annualSavingsPercent({ price: null, currencyCode: 'EUR' }, eur(35.99))).toBeNull();
    expect(annualSavingsPercent({ price: 3.59, currencyCode: 'USD' }, eur(35.99))).toBeNull();
  });
});

describe('annualPerMonthString', () => {
  it('formats the monthly equivalent in the rider locale, truncated to the cent', () => {
    // 35.99 / 12 = 2.9991... -> 2.99, never 3.00
    expect(annualPerMonthString(eur(35.99), 'en-GB')).toBe('€2.99');
  });

  it('is omitted without a numeric price or currency', () => {
    expect(annualPerMonthString(null, 'en-GB')).toBeNull();
    expect(annualPerMonthString({ price: 35.99, currencyCode: null }, 'en-GB')).toBeNull();
  });
});
