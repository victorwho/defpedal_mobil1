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
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

(globalThis as Record<string, unknown>).__DEV__ = false;

const { mockUseQuery, mockBlockEbike, mockParams, mockLocation, mockSearchLoops, mockHazardsQuery, mockGetProfile } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockBlockEbike: vi.fn(),
  mockParams: vi.fn(),
  mockLocation: vi.fn(),
  mockSearchLoops: vi.fn(),
  mockHazardsQuery: vi.fn(),
  mockGetProfile: vi.fn(),
}));

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
  useLocalSearchParams: () => mockParams(),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: { queryKey: unknown[] }) =>
    opts.queryKey[0] === 'onboarding-route-hazards' ? mockHazardsQuery(opts) : mockUseQuery(opts),
}));
vi.mock('../../design-system/organisms/Coachmark', () => ({
  Coachmark: ({ steps }: { steps: Array<{ key: string; text: string }> }) =>
    `tour:${steps.map((st) => st.key).join(',')}|${steps.map((st) => st.text).join('|')}`,
}));
vi.mock('../../hooks/usePremium', () => ({ usePremium: () => ({ blockEbikeRouting: mockBlockEbike }) }));
vi.mock('../../hooks/useCurrentLocation', () => ({
  useCurrentLocation: () => ({ location: mockLocation() }),
}));
vi.mock('../../hooks/useUnits', () => ({ useUnits: () => 'metric' }));
vi.mock('../../hooks/useTranslation', () => ({ useT: () => (key: string) => key }));
vi.mock('../../lib/telemetry', () => ({ telemetry: { capture: vi.fn() } }));
vi.mock('../../lib/api', () => ({ mobileApi: { previewRoute: vi.fn(), getProfile: () => mockGetProfile() } }));
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
import { markOnboardingTourShown, resetOnboardingTourForTest } from '../../lib/onboardingTour';

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
  mockHazardsQuery.mockReturnValue({ data: undefined, isLoading: false });
  resetOnboardingTourForTest();
  // Server switches as the install already has them, unless a test says otherwise.
  mockGetProfile.mockImplementation(async () => ({
    onboardingFirstRideEnabled: true,
    onboardingAnonymousRideEnabled: useAppStore.getState().onboardingAnonymousRide,
  }));
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

describe('OnboardingRouteRevealScreen — coachmarks [D4]', () => {
  // ~1.6 km east-west line in Bucharest, so the hazard step can be measured.
  const GEOMETRY = '_mbtsAwkrtpBcAo{@';

  const withComparison = (comparison: unknown) => ({
    ...route(),
    routes: [{ ...route().routes[0], geometryPolyline6: GEOMETRY }],
    comparison,
  });

  it('runs risk → compare → hazards inside coverage, with the honest compare line', () => {
    mockUseQuery.mockReturnValue({
      data: withComparison({
        against: 'fast',
        verdict: 'safer',
        diffPercent: 20,
        extraMinutes: 3,
        busyRoadMeters: { current: 200, comparison: 1500 },
      }),
      isError: false,
    });
    mockHazardsQuery.mockReturnValue({ data: 2, isLoading: false });

    render(<OnboardingRouteRevealScreen />);

    expect(screen.getAllByText(/tour:risk,compare,hazards[|]/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/onboardingRide.coachCompareCost/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/onboardingRide.coachHazardsSome/).length).toBeGreaterThan(0);
  });

  it('waits for the hazard count before starting the tour', () => {
    mockUseQuery.mockReturnValue({ data: withComparison(null), isError: false });
    mockHazardsQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<OnboardingRouteRevealScreen />);

    expect(screen.queryByText(/tour:/)).toBeNull();
  });

  it('keeps only the hazard step outside risk coverage', () => {
    useAppStore.getState().setRouteRequest({ destination: { lat: 40.71, lon: -74.0 } });
    mockUseQuery.mockReturnValue({ data: withComparison(null), isError: false });
    mockHazardsQuery.mockReturnValue({ data: 0, isLoading: false });

    render(<OnboardingRouteRevealScreen />);

    expect(screen.getAllByText(/tour:hazards[|]/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/onboardingRide.coachHazardsNone/).length).toBeGreaterThan(0);
  });

  it('runs once per session', () => {
    mockUseQuery.mockReturnValue({ data: withComparison(null), isError: false });
    mockHazardsQuery.mockReturnValue({ data: 0, isLoading: false });
    const { unmount } = render(<OnboardingRouteRevealScreen />);
    expect(screen.getAllByText(/tour:/).length).toBeGreaterThan(0);
    unmount();

    // The rider finished it (mocked Coachmark never calls onFinish, so mark it).
    markOnboardingTourShown();
    render(<OnboardingRouteRevealScreen />);
    expect(screen.queryByText(/tour:/)).toBeNull();
  });
});

describe('OnboardingRouteRevealScreen — first ride before signup (audit 2026-10-18 #2)', () => {
  beforeEach(() => {
    useAppStore.setState({ onboardingAnonymousRide: true, onboardingFlow: 'first_ride', completedRideCount: 0 });
  });
  afterEach(() => {
    useAppStore.setState({ onboardingAnonymousRide: false, onboardingFlow: null });
  });

  it('offers "Ride it now" and opens the real route preview with the route', () => {
    mockUseQuery.mockReturnValue({ data: route(), isError: false });
    render(<OnboardingRouteRevealScreen />);

    fireEvent.click(screen.getByText('onboardingRide.rideNowCta'));

    expect(useAppStore.getState().onboardingRouteFresh).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/route-preview');
  });

  it('still lets the rider save to an account first', () => {
    mockUseQuery.mockReturnValue({ data: route(), isError: false });
    render(<OnboardingRouteRevealScreen />);

    fireEvent.click(screen.getByText('onboardingRide.saveToAccount'));

    expect(router.push).toHaveBeenCalledWith('/onboarding/signup-prompt');
  });

  it('keeps today’s "save to ride" button when the switch is off (control)', () => {
    useAppStore.setState({ onboardingAnonymousRide: false });
    mockUseQuery.mockReturnValue({ data: route(), isError: false });
    render(<OnboardingRouteRevealScreen />);

    expect(screen.queryByText('onboardingRide.rideNowCta')).toBeNull();
    expect(screen.getByText('onboardingRide.saveCta')).toBeTruthy();
  });
});

describe('OnboardingRouteRevealScreen — anonymous-ride switch is re-read', () => {
  it('drops "Ride it now" when the server switch has been turned off', async () => {
    useAppStore.setState({ onboardingAnonymousRide: true, onboardingFlow: 'first_ride', completedRideCount: 0 });
    mockGetProfile.mockResolvedValue({ onboardingFirstRideEnabled: true, onboardingAnonymousRideEnabled: false });
    mockUseQuery.mockReturnValue({ data: route(), isError: false });

    render(<OnboardingRouteRevealScreen />);

    expect(await screen.findByText('onboardingRide.saveCta')).toBeTruthy();
    expect(screen.queryByText('onboardingRide.rideNowCta')).toBeNull();
    expect(useAppStore.getState().onboardingAnonymousRide).toBe(false);
    useAppStore.setState({ onboardingFlow: null });
  });
});

describe('OnboardingRouteRevealScreen — a failed re-read is not "off"', () => {
  it('keeps "Ride it now" when the profile read fails (cold server, no signal)', async () => {
    useAppStore.setState({ onboardingAnonymousRide: true, onboardingFlow: 'first_ride', completedRideCount: 0 });
    mockGetProfile.mockRejectedValue(new Error('timeout'));
    mockUseQuery.mockReturnValue({ data: route(), isError: false });

    render(<OnboardingRouteRevealScreen />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(useAppStore.getState().onboardingAnonymousRide).toBe(true);
    expect(screen.getByText('onboardingRide.rideNowCta')).toBeTruthy();
    useAppStore.setState({ onboardingFlow: null, onboardingAnonymousRide: false });
  });
});
