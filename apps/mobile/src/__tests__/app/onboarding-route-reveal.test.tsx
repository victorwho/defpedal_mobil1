// @vitest-environment happy-dom
/**
 * First-ride onboarding, step 5 (docs/plans/onboarding-first-ride.md [D4] [D9] [D10]).
 *
 *   1. The route is fetched with Plus modes masked: a rider who picked e-bike
 *      without Plus is routed on Safe — no paywall in onboarding.
 *   2. A route lands in `routePreview` (that is what survives signup) and the
 *      CTA hands it over and opens the wall.
 *   3. Outside risk coverage the screen says so instead of implying a score.
 *   4. A failed route never dead-ends: try another, or skip to the wall.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

(globalThis as Record<string, unknown>).__DEV__ = false;

const { mockUseQuery, mockBlockEbike, mockParams, mockLocation, mockSearchLoops } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockBlockEbike: vi.fn(),
  mockParams: vi.fn(),
  mockLocation: vi.fn(),
  mockSearchLoops: vi.fn(),
}));

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  useLocalSearchParams: () => mockParams(),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts: unknown) => mockUseQuery(opts) }));
vi.mock('../../hooks/usePremium', () => ({ usePremium: () => ({ blockEbikeRouting: mockBlockEbike }) }));
vi.mock('../../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({ location: mockLocation() }),
}));
vi.mock('../../hooks/useUnits', () => ({ useUnits: () => 'metric' }));
vi.mock('../../hooks/useTranslation', () => ({ useT: () => (key: string) => key }));
vi.mock('../../lib/telemetry', () => ({ telemetry: { capture: vi.fn() } }));
vi.mock('../../lib/api', () => ({ mobileApi: { previewRoute: vi.fn() } }));
vi.mock('../../lib/loop-generator', () => ({ searchLoops: mockSearchLoops }));
vi.mock('../../lib/loop-generator-remote', () => ({ searchLoopsRemote: vi.fn() }));
vi.mock('../../components/map', () => ({ RouteMap: () => null }));
vi.mock('../../design-system/organisms/RiskDistributionCard', () => ({
  RiskDistributionCard: () => 'risk-card',
}));
vi.mock('../../design-system', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('../../design-system/molecules/PedalSays', () => ({
  PedalSays: ({ line }: { line: string }) => line,
}));
vi.mock('../../design-system/atoms', () => {
  const React = require('react');
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    Button: ({ children, onPress, disabled }: { children?: React.ReactNode; onPress?: () => void; disabled?: boolean }) =>
      React.createElement('button', { onClick: onPress, disabled }, children),
    FadeSlideIn: Pass,
    Spinner: () => null,
  };
});
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));

import { router } from 'expo-router';
import OnboardingRouteRevealScreen from '../../../app/onboarding/route-reveal';
import { useAppStore } from '../../store/appStore';

const BUCHAREST = { lat: 44.43, lon: 26.1 };
const OFFICE = { lat: 44.45, lon: 26.08 };

const route = (riskSegments: unknown[] = [{ id: 's1' }]) => ({
  routes: [
    {
      id: 'r1',
      distanceMeters: 3200,
      durationSeconds: 840,
      riskSegments,
      geometryPolyline6: '',
      steps: [],
    },
  ],
  selectedMode: 'safe',
  comparison: null,
  coverage: { countryCode: 'RO', status: 'supported', safeRouting: true, fastRouting: true },
  generatedAt: new Date().toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockBlockEbike.mockReturnValue(false);
  mockParams.mockReturnValue({ intent: 'commute' });
  mockLocation.mockImplementation(() => ({ ...BUCHAREST }));
  useAppStore.setState({
    isEbike: false,
    onboardingRouteFresh: false,
    onboardingLoop: null,
    routePreview: null,
    appState: 'IDLE',
  });
  useAppStore.getState().setRouteRequest({ origin: BUCHAREST, destination: OFFICE, mode: 'safe' });
});

describe('OnboardingRouteRevealScreen', () => {
  it('routes an e-bike rider without Plus on Safe', () => {
    useAppStore.setState({ isEbike: true });
    mockBlockEbike.mockReturnValue(true);
    mockUseQuery.mockReturnValue({ data: undefined, isError: false });

    render(<OnboardingRouteRevealScreen />);

    const request = mockUseQuery.mock.calls[0][0].queryKey[1];
    expect(request.isEbike).toBe(false);
    expect(request.showRouteComparison).toBe(true);
  });

  it('keeps the e-bike graph for an entitled rider (control)', () => {
    useAppStore.setState({ isEbike: true });
    mockUseQuery.mockReturnValue({ data: undefined, isError: false });

    render(<OnboardingRouteRevealScreen />);

    expect(mockUseQuery.mock.calls[0][0].queryKey[1].isEbike).toBe(true);
  });

  it('puts the route in routePreview and hands it to the wall', () => {
    mockUseQuery.mockReturnValue({ data: route(), isError: false });

    render(<OnboardingRouteRevealScreen />);
    expect(useAppStore.getState().appState).toBe('ROUTE_PREVIEW');
    expect(screen.getByText(/risk-card/)).toBeTruthy();

    fireEvent.click(screen.getByText('onboardingRide.saveCta'));
    expect(useAppStore.getState().onboardingRouteFresh).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/onboarding/signup-prompt');
  });

  it('says risk data is missing outside coverage instead of implying a score', () => {
    useAppStore.getState().setRouteRequest({ destination: { lat: 40.71, lon: -74.0 } });
    mockUseQuery.mockReturnValue({ data: route([]), isError: false });

    render(<OnboardingRouteRevealScreen />);

    expect(screen.getByText(/onboardingRide.noCoverage/)).toBeTruthy();
    expect(screen.queryByText(/onboardingRide.revealPedal/)).toBeNull();
  });

  it('never dead-ends when the route fails', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isError: true });

    render(<OnboardingRouteRevealScreen />);
    expect(screen.getByText('onboardingRide.routeFailed')).toBeTruthy();

    fireEvent.click(screen.getByText('onboardingRide.tryAnother'));
    expect(router.back).toHaveBeenCalled();
    fireEvent.click(screen.getByText('onboardingRide.skip'));
    expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt');
  });
});

describe('OnboardingRouteRevealScreen — loop branch', () => {
  const loop = {
    id: 'loop-1',
    measured: true,
    distanceMeters: 5100,
    coordinates: [[26.1, 44.43]],
    route: { id: 'loop-route', distanceMeters: 5100, durationSeconds: 1200, riskSegments: [{ id: 's' }] },
  };

  beforeEach(() => {
    mockParams.mockReturnValue({ intent: 'loop' });
    mockUseQuery.mockReturnValue({ data: undefined, isError: false });
  });

  it('a fresh location fix does not abort the running search', async () => {
    let signal: AbortSignal | undefined;
    let deliver: (() => void) | undefined;
    mockSearchLoops.mockImplementation(
      (_req: unknown, cb: { signal: AbortSignal; onCandidate: (l: unknown) => void }) => {
        signal = cb.signal;
        return new Promise((resolve) => {
          deliver = () => {
            cb.onCandidate(loop);
            resolve({ status: 'cancelled' });
          };
        });
      },
    );

    const { rerender } = render(<OnboardingRouteRevealScreen />);
    // useCurrentLocation publishes a new object for the same place.
    rerender(<OnboardingRouteRevealScreen />);

    expect(mockSearchLoops).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);

    deliver?.();
    fireEvent.click(await screen.findByText('onboardingRide.saveCta'));
    expect(useAppStore.getState().onboardingLoop).toEqual(loop);
    expect(useAppStore.getState().onboardingRouteFresh).toBe(false);
  });

  it('says so when no loop exists here', async () => {
    mockSearchLoops.mockResolvedValue({ status: 'empty' });
    render(<OnboardingRouteRevealScreen />);
    expect(await screen.findByText(/onboardingRide.loopFailed/)).toBeTruthy();
  });
});
