// @vitest-environment happy-dom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as Record<string, unknown>).__DEV__ = false;

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));

const RECENT = {
  id: 'ride-1',
  label: 'Piața Unirii, București',
  primaryText: 'Piața Unirii',
  coordinates: { lat: 44.427, lon: 26.103 },
};

vi.mock('../../hooks/useRecentRideDestinations', () => ({
  useRecentRideDestinations: () => [RECENT],
}));
vi.mock('../../lib/mapbox-search', () => ({ resolveSuggestion: mockResolve }));
vi.mock('../../lib/api', () => ({ mobileApi: { autocomplete: vi.fn() } }));
vi.mock('../../lib/env', () => ({ mobileEnv: { mapboxPublicToken: 'pk.test' } }));
vi.mock('../../hooks/useKeyboardHeight', () => ({ useKeyboardHeight: () => 0 }));
vi.mock('../../hooks/useUnits', () => ({ useUnits: () => 'metric' }));
vi.mock('../../hooks/useTranslation', () => ({ useT: () => (key: string) => key }));
vi.mock('../../design-system', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('../../design-system/atoms', () => ({ Spinner: () => null }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));
// The real SearchBar is covered by its own tests; here only the wiring matters.
vi.mock('../../design-system/molecules/SearchBar', () => {
  const R = require('react');
  return {
    SearchBar: ({ recentDestinations, onSelectSuggestion }: {
      recentDestinations: { id: string; primaryText: string }[];
      onSelectSuggestion: (s: unknown) => void;
    }) =>
      R.createElement(
        'div',
        null,
        recentDestinations.map((d) =>
          R.createElement('button', { key: d.id, onClick: () => onSelectSuggestion(d) }, d.primaryText),
        ),
      ),
  };
});

import { ChangeDestinationSheet } from '../ChangeDestinationSheet';

const renderSheet = (props: Partial<React.ComponentProps<typeof ChangeDestinationSheet>> = {}) => {
  const onPick = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChangeDestinationSheet
        visible
        proximity={{ lat: 44.43, lon: 26.1 }}
        routing={false}
        errorText={null}
        onPick={onPick}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onPick };
};

beforeEach(() => vi.clearAllMocks());

describe('ChangeDestinationSheet', () => {
  it('offers recent destinations as one-tap picks and hands the resolved place up', async () => {
    mockResolve.mockResolvedValue({ ...RECENT, coordinates: RECENT.coordinates });
    const { onPick } = renderSheet();

    fireEvent.click(screen.getByText('Piața Unirii'));

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick.mock.calls[0][0].coordinates).toEqual(RECENT.coordinates);
  });

  it('reports a place that cannot be located instead of routing to it', async () => {
    mockResolve.mockResolvedValue(null);
    const { onPick } = renderSheet();

    fireEvent.click(screen.getByText('Piața Unirii'));

    await waitFor(() => expect(screen.getByText('planning.placeNotFound')).toBeTruthy());
    expect(onPick).not.toHaveBeenCalled();
  });

  it('ignores picks while a route is being computed, and says so', () => {
    const { onPick } = renderSheet({ routing: true });
    expect(screen.getByText('nav.changeDestinationRouting')).toBeTruthy();
    fireEvent.click(screen.getByText('Piața Unirii'));
    expect(mockResolve).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('shows why the last pick could not be routed to', () => {
    renderSheet({ errorText: 'nav.changeDestinationFailed' });
    expect(screen.getByText('nav.changeDestinationFailed')).toBeTruthy();
  });
});
