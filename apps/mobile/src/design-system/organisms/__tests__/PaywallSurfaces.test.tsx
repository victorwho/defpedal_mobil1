// @vitest-environment happy-dom
//
// Paywall surfaces. The checks that matter are the honesty ones, because they
// are the difference between an offer and a false promise:
//   - cool routing is only advertised where the shade graph actually exists
//   - every free-tier number comes from the catalog, never a literal in copy
//   - a plan with no price from the store is not offered at all
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

// `@expo/vector-icons/Ionicons` cannot be parsed by vitest's bundler (it
// resolves to a package that requires `./createIconSet`). Same stub the
// HazardDetailSheet suite uses — without it the whole file fails to collect
// with a bare "Expression expected".
vi.mock('@expo/vector-icons/Ionicons', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      R.createElement('span', { 'data-icon': String(props.name) }),
  };
});

vi.mock('@expo/vector-icons', () => {
  const R = require('react');
  const Icon = ({ name }: { name: string }) => R.createElement('span', { 'data-icon': name });
  return { Ionicons: Icon, MaterialIcons: Icon, Feather: Icon };
});


import { FREE_LIMITS } from '@defensivepedal/core';

import { PaywallSheet } from '../PaywallSheet';
import { PremiumLimitCard } from '../PremiumLimitCard';

const wrap = (ui: React.ReactElement) => render(ui);

const sheetProps = {
  visible: true,
  onDismiss: vi.fn(),
  limits: FREE_LIMITS,
  onSubscribe: vi.fn(),
  onRestore: vi.fn(),
};

describe('PaywallSheet — honesty about coverage', () => {
  it('does NOT advertise cool routing where there is no shade data', () => {
    // Selling a Romania-only feature to a rider elsewhere is a lie the moment
    // they pay for it.
    wrap(<PaywallSheet {...sheetProps} coolRoutingAvailable={false} />);
    expect(screen.queryByText('Cool routing')).toBeNull();
  });

  it('advertises cool routing where the shade graph exists', () => {
    wrap(<PaywallSheet {...sheetProps} coolRoutingAvailable />);
    expect(screen.getByText('Cool routing')).toBeTruthy();
  });
});

describe('PaywallSheet — copy is driven by the catalog', () => {
  it('quotes the real free saved-route limit', () => {
    wrap(<PaywallSheet {...sheetProps} />);
    expect(
      screen.getByText(`Keep every commute, loop and errand. Free keeps ${FREE_LIMITS.savedRoutes}.`),
    ).toBeTruthy();
  });

  it('quotes the real free history window', () => {
    wrap(<PaywallSheet {...sheetProps} />);
    expect(
      screen.getByText(
        `Every ride you have taken, not just the last ${FREE_LIMITS.historyWindowDays} days.`,
      ),
    ).toBeTruthy();
  });

  it('follows a changed catalog rather than a hardcoded string', () => {
    wrap(<PaywallSheet {...sheetProps} limits={{ ...FREE_LIMITS, savedRoutes: 99 }} />);
    expect(screen.getByText(/Free keeps 99\./)).toBeTruthy();
  });
});

describe('PaywallSheet — plans', () => {
  it('offers nothing until the store returns a price', () => {
    // Never render a purchase button that cannot name what it charges.
    wrap(<PaywallSheet {...sheetProps} />);
    expect(screen.queryByText(/month/)).toBeNull();
    expect(screen.queryByText(/year/)).toBeNull();
  });

  it('offers the monthly plan with its localised price', () => {
    wrap(<PaywallSheet {...sheetProps} monthlyPrice="3,00 €" />);
    expect(screen.getByText(/3,00 €\s*\/\s*month/)).toBeTruthy();
  });

  it('offers the annual plan only when priced', () => {
    wrap(<PaywallSheet {...sheetProps} monthlyPrice="3,00 €" annualPrice="30,00 €" />);
    expect(screen.getByText(/30,00 €\s*\/\s*year/)).toBeTruthy();
  });

  it('says "Subscribe" when there is no trial and "Start free trial" when there is', () => {
    const { unmount } = wrap(<PaywallSheet {...sheetProps} monthlyPrice="3,00 €" />);
    expect(screen.getByText(/Subscribe/)).toBeTruthy();
    unmount();

    wrap(<PaywallSheet {...sheetProps} monthlyPrice="3,00 €" trialDays={7} />);
    expect(screen.getByText(/Start free trial/)).toBeTruthy();
  });

  it('states the trial terms plainly', () => {
    wrap(<PaywallSheet {...sheetProps} monthlyPrice="3,00 €" trialDays={7} />);
    expect(screen.getByText('7-day free trial, then 3,00 €.')).toBeTruthy();
  });

  it('reports the chosen plan to the caller', () => {
    const onSubscribe = vi.fn();
    wrap(
      <PaywallSheet
        {...sheetProps}
        onSubscribe={onSubscribe}
        monthlyPrice="3,00 €"
        annualPrice="30,00 €"
      />,
    );
    fireEvent.click(screen.getByText(/\/ month/));
    expect(onSubscribe).toHaveBeenCalledWith('monthly');
  });

  it('always offers restore — required by both stores', () => {
    const onRestore = vi.fn();
    wrap(<PaywallSheet {...sheetProps} onRestore={onRestore} />);
    fireEvent.click(screen.getByText('Restore purchase'));
    expect(onRestore).toHaveBeenCalled();
  });

  it('discloses auto-renewal', () => {
    wrap(<PaywallSheet {...sheetProps} />);
    expect(screen.getByText(/Renews automatically until cancelled/)).toBeTruthy();
  });

  it('renders nothing when not visible', () => {
    wrap(<PaywallSheet {...sheetProps} visible={false} />);
    expect(screen.queryByText('Unlimited saved routes')).toBeNull();
  });
});

describe('PremiumLimitCard', () => {
  it('quotes the catalog number for saved routes', () => {
    wrap(
      <PremiumLimitCard
        kind="savedRoutes"
        limitValue={FREE_LIMITS.savedRoutes!}
        onUpgrade={vi.fn()}
      />,
    );
    expect(screen.getByText(/Free keeps 5 saved routes/)).toBeTruthy();
  });

  it('tells a rider at the flat limit they still get a route', () => {
    // A safety product must never leave someone without navigation.
    wrap(
      <PremiumLimitCard
        kind="flatRoutes"
        limitValue={FREE_LIMITS.flatRidesPerMonth!}
        onUpgrade={vi.fn()}
      />,
    );
    expect(screen.getByText(/We will plan a Safe route instead/)).toBeTruthy();
  });

  it('reassures that hidden history is not deleted', () => {
    wrap(
      <PremiumLimitCard
        kind="history"
        limitValue={FREE_LIMITS.historyWindowDays!}
        onUpgrade={vi.fn()}
      />,
    );
    expect(screen.getByText(/Your older rides are safe/)).toBeTruthy();
  });

  it('uses days, not count, for the history window', () => {
    wrap(<PremiumLimitCard kind="history" limitValue={90} onUpgrade={vi.fn()} />);
    expect(screen.getByText(/last 90 days/)).toBeTruthy();
  });

  it('calls back on upgrade', () => {
    const onUpgrade = vi.fn();
    wrap(<PremiumLimitCard kind="savedRoutes" limitValue={5} onUpgrade={onUpgrade} />);
    fireEvent.click(screen.getByText('Go Plus'));
    expect(onUpgrade).toHaveBeenCalled();
  });

  it('omits the dismiss action when no handler is given', () => {
    wrap(<PremiumLimitCard kind="savedRoutes" limitValue={5} onUpgrade={vi.fn()} />);
    expect(screen.queryByText('Not now')).toBeNull();
  });

  it('offers dismissal when a handler is given', () => {
    const onDismiss = vi.fn();
    wrap(
      <PremiumLimitCard
        kind="savedRoutes"
        limitValue={5}
        onUpgrade={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('Not now'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
