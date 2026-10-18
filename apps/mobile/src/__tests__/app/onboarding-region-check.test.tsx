// @vitest-environment happy-dom
/**
 * Onboarding region gate — behavior tests (global availability, 2026-07-12).
 *
 * Contract under test (consent screen removed from the flow 2026-07-16 —
 * the gate now routes straight to the signup prompt AND owns marking
 * onboarding complete before it):
 *   1. Supported country detected via GPS → gate passes silently (store
 *      records `passed`, onboarding marked complete, user is replaced to
 *      the signup prompt, no picker rendered).
 *   2. Unsupported country detected → waitlist panel with the country name,
 *      email submit through mobileApi.joinCountryWaitlist, and a
 *      "Continue anyway" soft gate that records `waitlisted`.
 *   3. No detection (permission denied / geocode failure) → manual country
 *      picker; picking a supported country passes, an unsupported one goes
 *      to the waitlist.
 *   4. A device that already answered the gate is replaced straight to the
 *      signup prompt without re-running detection.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

(globalThis as Record<string, unknown>).__DEV__ = false;

// --- Mocks (hoisted by vitest above the screen import) ----------------------

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn() },
}));

const { mockDetectCountryCode, mockJoinCountryWaitlist, mockGetProfile } = vi.hoisted(() => ({
  mockDetectCountryCode: vi.fn(),
  mockJoinCountryWaitlist: vi.fn(),
  mockGetProfile: vi.fn(),
}));

vi.mock('../../lib/regionGate', () => ({
  detectCountryCode: mockDetectCountryCode,
}));

vi.mock('../../lib/api', () => ({
  mobileApi: { joinCountryWaitlist: mockJoinCountryWaitlist, getProfile: mockGetProfile },
}));

// Echo translation keys so assertions can match on the key string.
vi.mock('../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${Object.values(vars).join(',')}` : key,
}));

vi.mock('../../design-system', () => ({
  useTheme: () => ({ colors: {} }),
}));

vi.mock('../../design-system/atoms', () => {
  const React = require('react');
  return {
    Button: ({
      children,
      onPress,
      disabled,
      loading,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      loading?: boolean;
    }) =>
      React.createElement('button', { onClick: onPress, disabled: disabled || loading }, children),
  };
});

vi.mock('../../components/BrandLogo', () => ({ BrandLogo: () => null }));

vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));

import { router } from 'expo-router';
import OnboardingRegionCheckScreen from '../../../app/onboarding/region-check';
import { useAppStore } from '../../store/appStore';

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    regionGate: { status: 'unchecked', countryCode: null },
    locale: 'en',
    // The gate now owns onboarding completion (consent screen removed
    // 2026-07-16) — start each test from a fresh install's state.
    onboardingCompleted: false,
    anonymousOpenCount: 1,
    onboardingFlow: null,
  });
  mockJoinCountryWaitlist.mockResolvedValue({ status: 'joined' });
  // Server switch off by default: today's flow.
  mockGetProfile.mockResolvedValue({ onboardingFirstRideEnabled: false });
});

describe('Region gate — GPS detection', () => {
  it('passes silently when the detected country is supported', async () => {
    mockDetectCountryCode.mockResolvedValue('FR');
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt'),
    );
    expect(useAppStore.getState().regionGate).toEqual({
      status: 'passed',
      countryCode: 'FR',
    });
    // The gate marks onboarding complete BEFORE the signup prompt (the
    // completion logic the deleted consent screen used to own) and resets
    // the anonymous open count exactly once, on initial completion.
    expect(useAppStore.getState().onboardingCompleted).toBe(true);
    expect(useAppStore.getState().anonymousOpenCount).toBe(0);
    expect(screen.queryByText('onboarding.regionPickerTitle')).toBeNull();
  });

  it('shows the waitlist with the country name when detection finds an unsupported country', async () => {
    mockDetectCountryCode.mockResolvedValue('US');
    render(<OnboardingRegionCheckScreen />);

    await screen.findByText('onboarding.regionUnavailableTitle:United States');
    expect(router.replace).not.toHaveBeenCalled();
    expect(useAppStore.getState().regionGate.status).toBe('unchecked');
  });

  it('falls back to the country picker when detection fails', async () => {
    mockDetectCountryCode.mockResolvedValue(null);
    render(<OnboardingRegionCheckScreen />);

    await screen.findByText('onboarding.regionPickerTitle');
  });

  it('replaces straight to consent when the gate was already answered', async () => {
    useAppStore.setState({ regionGate: { status: 'waitlisted', countryCode: 'US' } });
    mockDetectCountryCode.mockResolvedValue(null);
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt'),
    );
    expect(mockDetectCountryCode).not.toHaveBeenCalled();
  });

  it('does NOT reset the anonymous open count when onboarding was already completed (re-prompt gate safety)', async () => {
    // A returning anonymous user re-entering the flow (e.g. via profile
    // sign-out → /onboarding) must not have their open count zeroed —
    // otherwise the count-based signup re-prompt (>=2 dismissible, >=3
    // mandatory in computeOnboardingGateTarget) could loop forever.
    useAppStore.setState({
      regionGate: { status: 'passed', countryCode: 'RO' },
      onboardingCompleted: true,
      anonymousOpenCount: 2,
    });
    mockDetectCountryCode.mockResolvedValue(null);
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt'),
    );
    expect(useAppStore.getState().anonymousOpenCount).toBe(2);
    expect(useAppStore.getState().onboardingCompleted).toBe(true);
  });
});

describe('Region gate — country picker', () => {
  beforeEach(() => {
    mockDetectCountryCode.mockResolvedValue(null);
  });

  it('passes the gate when a supported country is picked', async () => {
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionPickerTitle');

    fireEvent.click(screen.getByText('Romania'));

    expect(useAppStore.getState().regionGate).toEqual({
      status: 'passed',
      countryCode: 'RO',
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt'),
    );
  });

  it('moves to the waitlist when an unsupported country is picked', async () => {
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionPickerTitle');

    const search = screen.getByPlaceholderText('onboarding.regionSearchPlaceholder');
    fireEvent.change(search, { target: { value: 'brazil' } });
    fireEvent.click(screen.getByText('Brazil'));

    await screen.findByText('onboarding.regionUnavailableTitle:Brazil');
    expect(useAppStore.getState().regionGate.status).toBe('unchecked');
  });
});

describe('Region gate — waitlist', () => {
  beforeEach(() => {
    mockDetectCountryCode.mockResolvedValue('US');
  });

  it('rejects an invalid email without calling the API', async () => {
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionNotifyMe');

    const input = screen.getByPlaceholderText('onboarding.regionEmailPlaceholder');
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByText('onboarding.regionNotifyMe'));

    await screen.findByText('onboarding.regionEmailInvalid');
    expect(mockJoinCountryWaitlist).not.toHaveBeenCalled();
  });

  it('submits a valid email with country + detected country + locale', async () => {
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionNotifyMe');

    const input = screen.getByPlaceholderText('onboarding.regionEmailPlaceholder');
    fireEvent.change(input, { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByText('onboarding.regionNotifyMe'));

    await screen.findByText('onboarding.regionSubmitted:United States');
    expect(mockJoinCountryWaitlist).toHaveBeenCalledWith({
      email: 'rider@example.com',
      countryCode: 'US',
      detectedCountryCode: 'US',
      locale: 'en',
      source: 'onboarding',
    });
  });

  it('surfaces a retryable error when the API call fails', async () => {
    mockJoinCountryWaitlist.mockRejectedValue(new Error('network down'));
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionNotifyMe');

    const input = screen.getByPlaceholderText('onboarding.regionEmailPlaceholder');
    fireEvent.change(input, { target: { value: 'rider@example.com' } });
    fireEvent.click(screen.getByText('onboarding.regionNotifyMe'));

    await screen.findByText('onboarding.regionSubmitFailed');
    expect(useAppStore.getState().regionGate.status).toBe('unchecked');
  });

  it('Continue anyway records waitlisted and proceeds to consent (soft gate)', async () => {
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionContinueAnyway');

    fireEvent.click(screen.getByText('onboarding.regionContinueAnyway'));

    expect(useAppStore.getState().regionGate).toEqual({
      status: 'waitlisted',
      countryCode: 'US',
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt'),
    );
  });

  it('Change country returns to the picker', async () => {
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionChangeCountry');

    fireEvent.click(screen.getByText('onboarding.regionChangeCountry'));

    await screen.findByText('onboarding.regionPickerTitle');
  });
});

describe('Region gate — which onboarding runs (docs/plans/onboarding-first-ride.md [D12])', () => {
  beforeEach(() => {
    mockDetectCountryCode.mockResolvedValue('FR');
  });

  it('sends a fresh install to the first-ride flow when the server switch is on, without completing onboarding', async () => {
    mockGetProfile.mockResolvedValue({ onboardingFirstRideEnabled: true });
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/ride-intent'),
    );
    expect(useAppStore.getState().onboardingFlow).toBe('first_ride');
    // Completion waits for the account; a hard-close before signup must
    // re-enter this flow, not land on the bare wall.
    expect(useAppStore.getState().onboardingCompleted).toBe(false);
    expect(router.replace).not.toHaveBeenCalledWith('/onboarding/signup-prompt');
  });

  it('fails closed to today’s flow when the profile read fails, without persisting it', async () => {
    mockGetProfile.mockRejectedValue(new Error('401'));
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt'),
    );
    // Not a server answer, so the question stays open for the next pass —
    // a slow first launch must not lock the install out of the new flow.
    expect(useAppStore.getState().onboardingFlow).toBeNull();
  });

  it('persists a definitive "off" from the server', async () => {
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/signup-prompt'),
    );
    expect(useAppStore.getState().onboardingFlow).toBe('legacy');
  });

  it('keeps a persisted decision and does not ask the server again', async () => {
    useAppStore.setState({ onboardingFlow: 'first_ride' });
    // Switch now OFF server-side — the install must stay on its flow.
    mockGetProfile.mockResolvedValue({ onboardingFirstRideEnabled: false });
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/ride-intent'),
    );
    expect(mockGetProfile).not.toHaveBeenCalled();
  });
});
