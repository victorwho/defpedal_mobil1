// @vitest-environment happy-dom
/**
 * First-ride onboarding, step 3 (docs/plans/onboarding-first-ride.md [D3] [D5]).
 *
 *   1. Nothing can be planned until an intent, a bike and (for A-to-B) a place
 *      are chosen.
 *   2. Continue stores the bike type and the route request, then opens the
 *      reveal — the bike must be known BEFORE routing.
 *   3. Without a location the loop option disappears and a skip appears.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

(globalThis as Record<string, unknown>).__DEV__ = false;

const { mockLocation, mockResolve } = vi.hoisted(() => ({
  mockLocation: vi.fn(),
  mockResolve: vi.fn(),
}));

vi.mock('expo-router', () => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock('../../hooks/useCurrentLocation', () => ({ useCurrentLocation: () => mockLocation() }));
vi.mock('../../hooks/useUnits', () => ({ useUnits: () => 'metric' }));
vi.mock('../../lib/telemetry', () => ({ telemetry: { capture: vi.fn() } }));
vi.mock('../../lib/api', () => ({ mobileApi: { autocomplete: vi.fn() } }));
vi.mock('../../lib/env', () => ({ mobileEnv: { mapboxPublicToken: '' } }));
vi.mock('../../lib/mapbox-search', () => ({ resolveSuggestion: mockResolve }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isFetching: false }),
}));
vi.mock('../../hooks/useTranslation', () => ({ useT: () => (key: string) => key }));
vi.mock('../../design-system', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('../../design-system/molecules/PedalSays', () => ({
  PedalSays: ({ line }: { line: string }) => line,
}));
vi.mock('../../design-system/molecules/SearchBar', () => {
  const React = require('react');
  return {
    SearchBar: ({ onSelectSuggestion }: { onSelectSuggestion: (s: unknown) => void }) =>
      React.createElement(
        'button',
        { onClick: () => onSelectSuggestion({ id: 'x', label: 'Office' }) },
        'pick-office',
      ),
  };
});
vi.mock('../../design-system/atoms', () => {
  const React = require('react');
  return {
    Button: ({ children, onPress, disabled }: { children?: React.ReactNode; onPress?: () => void; disabled?: boolean }) =>
      React.createElement('button', { onClick: onPress, disabled }, children),
  };
});
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));

import { router } from 'expo-router';
import OnboardingRideIntentScreen from '../../../app/onboarding/ride-intent';
import { useAppStore } from '../../store/appStore';

const HERE = { lat: 44.43, lon: 26.1 };
const OFFICE = { lat: 44.45, lon: 26.08 };

beforeEach(() => {
  vi.clearAllMocks();
  mockLocation.mockReturnValue({ location: HERE, permissionStatus: 'granted', isLoading: false });
  mockResolve.mockResolvedValue({ id: 'x', label: 'Office', coordinates: OFFICE });
  useAppStore.setState({ bikeTypeId: null, bikeTypePromptSeen: false, isEbike: false });
});

const continueButton = () => screen.getByText('onboardingRide.showRoute') as HTMLButtonElement;

describe('OnboardingRideIntentScreen', () => {
  it('keeps Continue disabled until intent, bike and place are chosen', async () => {
    render(<OnboardingRideIntentScreen />);
    expect(continueButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('onboardingRide.intentCommute. onboardingRide.intentCommuteSub'));
    fireEvent.click(screen.getByText('onboardingRide.bikeRoadCity'));
    expect(continueButton().disabled).toBe(true);

    fireEvent.click(screen.getByText('pick-office'));
    await waitFor(() => expect(continueButton().disabled).toBe(false));
  });

  it('stores the bike and the route request, then opens the reveal', async () => {
    render(<OnboardingRideIntentScreen />);
    fireEvent.click(screen.getByLabelText('onboardingRide.intentCommute. onboardingRide.intentCommuteSub'));
    fireEvent.click(screen.getByText('onboardingRide.bikeEbike'));
    fireEvent.click(screen.getByText('pick-office'));
    await waitFor(() => expect(continueButton().disabled).toBe(false));

    fireEvent.click(continueButton());

    const state = useAppStore.getState();
    expect(state.bikeTypeId).toBe('ebike');
    expect(state.bikeTypePromptSeen).toBe(true);
    expect(state.routeRequest.origin).toEqual(HERE);
    expect(state.routeRequest.destination).toEqual(OFFICE);
    expect(state.routeRequest.mode).toBe('safe');
    expect(state.isEbike).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/onboarding/route-reveal?intent=commute');
  });

  it('plans a loop without a place, and records "no bike yet"', () => {
    render(<OnboardingRideIntentScreen />);
    fireEvent.click(screen.getByLabelText('onboardingRide.intentLoop. onboardingRide.intentLoopSub'));
    fireEvent.click(screen.getByText('onboardingRide.bikeNone'));
    fireEvent.click(continueButton());

    expect(useAppStore.getState().bikeTypeId).toBe('none');
    expect(router.push).toHaveBeenCalledWith('/onboarding/route-reveal?intent=loop');
  });

  it.each([
    ['onboardingRide.bikeRoadCity', 'city', true],
    ['onboardingRide.bikeMountain', 'mountain', false],
    ['onboardingRide.bikeEbike', 'ebike', false],
    ['onboardingRide.bikeNone', 'none', false],
  ] as const)('%s → bike %s, avoid unpaved %s', (label, id, avoidUnpaved) => {
    // Start from the opposite, as if the rider had answered differently before.
    useAppStore.setState({ avoidUnpaved: !avoidUnpaved });
    render(<OnboardingRideIntentScreen />);
    fireEvent.click(screen.getByLabelText('onboardingRide.intentLoop. onboardingRide.intentLoopSub'));
    fireEvent.click(screen.getByText(label));
    fireEvent.click(continueButton());

    expect(useAppStore.getState().bikeTypeId).toBe(id);
    expect(useAppStore.getState().avoidUnpaved).toBe(avoidUnpaved);
  });

  it('shows the "avoid unpaved" consequence only for road/city', () => {
    render(<OnboardingRideIntentScreen />);
    fireEvent.click(screen.getByText('onboardingRide.bikeMountain'));
    expect(screen.queryByText('onboarding.bikeConsequencePaved')).toBeNull();
    fireEvent.click(screen.getByText('onboardingRide.bikeRoadCity'));
    expect(screen.getByText('onboarding.bikeConsequencePaved')).toBeTruthy();
  });

  it('hides the loop and offers a skip when there is no location', () => {
    mockLocation.mockReturnValue({ location: null, permissionStatus: 'denied', isLoading: false });
    render(<OnboardingRideIntentScreen />);

    expect(screen.queryByLabelText('onboardingRide.intentLoop. onboardingRide.intentLoopSub')).toBeNull();
    fireEvent.click(screen.getByText('onboardingRide.skip'));
    expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt');
  });
});
