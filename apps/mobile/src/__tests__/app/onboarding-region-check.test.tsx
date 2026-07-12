// @vitest-environment happy-dom
/**
 * Onboarding region gate — behavior tests (global availability, 2026-07-12).
 *
 * Contract under test:
 *   1. Supported country detected via GPS → gate passes silently (store
 *      records `passed`, user is replaced to consent, no picker rendered).
 *   2. Unsupported country detected → waitlist panel with the country name,
 *      email submit through mobileApi.joinCountryWaitlist, and a
 *      "Continue anyway" soft gate that records `waitlisted`.
 *   3. No detection (permission denied / geocode failure) → manual country
 *      picker; picking a supported country passes, an unsupported one goes
 *      to the waitlist.
 *   4. A device that already answered the gate is replaced straight to
 *      consent without re-running detection.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

(globalThis as Record<string, unknown>).__DEV__ = false;

// --- Mocks (hoisted by vitest above the screen import) ----------------------

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn() },
}));

const { mockDetectCountryCode, mockJoinCountryWaitlist } = vi.hoisted(() => ({
  mockDetectCountryCode: vi.fn(),
  mockJoinCountryWaitlist: vi.fn(),
}));

vi.mock('../../lib/regionGate', () => ({
  detectCountryCode: mockDetectCountryCode,
}));

vi.mock('../../lib/api', () => ({
  mobileApi: { joinCountryWaitlist: mockJoinCountryWaitlist },
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
  });
  mockJoinCountryWaitlist.mockResolvedValue({ status: 'joined' });
});

describe('Region gate — GPS detection', () => {
  it('passes silently when the detected country is supported', async () => {
    mockDetectCountryCode.mockResolvedValue('FR');
    render(<OnboardingRegionCheckScreen />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/consent'),
    );
    expect(useAppStore.getState().regionGate).toEqual({
      status: 'passed',
      countryCode: 'FR',
    });
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
      expect(router.replace).toHaveBeenCalledWith('/onboarding/consent'),
    );
    expect(mockDetectCountryCode).not.toHaveBeenCalled();
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
    expect(router.replace).toHaveBeenCalledWith('/onboarding/consent');
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
    expect(router.replace).toHaveBeenCalledWith('/onboarding/consent');
  });

  it('Change country returns to the picker', async () => {
    render(<OnboardingRegionCheckScreen />);
    await screen.findByText('onboarding.regionChangeCountry');

    fireEvent.click(screen.getByText('onboarding.regionChangeCountry'));

    await screen.findByText('onboarding.regionPickerTitle');
  });
});
