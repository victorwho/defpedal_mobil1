// @vitest-environment happy-dom
/**
 * Onboarding location pre-permission screen — compliance regression tests.
 *
 * App Store Guideline 5.1.1(iv): a pre-permission priming message must NOT
 * offer a skip/exit that lets the user dodge the system permission request.
 * The user must always proceed to the OS prompt after the message. The app
 * was rejected twice on this exact screen — these tests lock the invariant:
 *   1. No skip/exit affordance renders on the priming screen.
 *   2. The single CTA triggers the OS location request.
 *   3. After a denial (post-request) the user may continue without location
 *      and is offered an "Open Settings" recovery link.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// React Native's __DEV__ global is not available in vitest.
(globalThis as Record<string, unknown>).__DEV__ = false;

// --- Mocks (hoisted by vitest above the screen import) ----------------------

vi.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: vi.fn(),
  getForegroundPermissionsAsync: vi.fn(),
}));

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn() },
}));

// Echo translation keys so assertions can match on the key string.
vi.mock('../../hooks/useTranslation', () => ({
  useT: () => (key: string) => key,
}));

// Minimal theme — createThemedStyles only reads color values into a style
// object (never rendered by happy-dom), so an empty palette is sufficient.
vi.mock('../../design-system', () => ({
  useTheme: () => ({ colors: {} }),
}));

// Stub the two atoms the screen pulls from the barrel. Real Button drags in
// PressableScale + Animated + haptics; real Mascot require()s PNG pose tokens.
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
    Mascot: () => null,
  };
});

vi.mock('../../components/BrandLogo', () => ({ BrandLogo: () => null }));

vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));

import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import OnboardingPermissionScreen from '../../../app/onboarding/index';

const mockRequest = vi.mocked(Location.requestForegroundPermissionsAsync);
const mockGetExisting = vi.mocked(Location.getForegroundPermissionsAsync);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: permission not yet decided → on-mount auto-advance stays silent.
  mockGetExisting.mockResolvedValue({ status: 'undetermined' } as never);
  mockRequest.mockResolvedValue({ status: 'granted' } as never);
});

describe('Onboarding location priming — Guideline 5.1.1(iv)', () => {
  it('renders no skip/exit affordance on the priming message', () => {
    render(<OnboardingPermissionScreen />);

    // None of the former skip controls may appear before the request.
    expect(screen.queryByText('onboarding.skip')).toBeNull();
    expect(screen.queryByText('onboarding.skipShort')).toBeNull();
    expect(screen.queryByLabelText('onboarding.a11ySkip')).toBeNull();

    // The only actionable control is the single permission CTA.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('onboarding.enableLocation')).toBeTruthy();
  });

  it('proceeds to the OS permission request when the CTA is pressed', async () => {
    render(<OnboardingPermissionScreen />);

    fireEvent.click(screen.getByText('onboarding.enableLocation'));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
    // Granted → advance to the consent step.
    expect(router.push).toHaveBeenCalledWith('/onboarding/consent');
  });

  it('after a denial, offers continue-without-location and an Open Settings link', async () => {
    mockRequest.mockResolvedValue({ status: 'denied' } as never);
    render(<OnboardingPermissionScreen />);

    fireEvent.click(screen.getByText('onboarding.enableLocation'));

    // Post-request recovery UI (allowed — it appears AFTER the prompt).
    await screen.findByText('onboarding.continueWithoutLocation');
    expect(screen.getByText('onboarding.openSettings')).toBeTruthy();
    // The skip-the-prompt affordance must still be absent in the denied state.
    expect(screen.queryByText('onboarding.skip')).toBeNull();

    const openSettingsSpy = vi.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    fireEvent.click(screen.getByText('onboarding.openSettings'));
    expect(openSettingsSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('onboarding.continueWithoutLocation'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/consent');
  });
});
