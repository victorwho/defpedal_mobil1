// @vitest-environment happy-dom
/**
 * Onboarding bike-type step — E-bike is a Pedal Plus option (2026-10-09).
 *
 *   1. Locked (paywall live, not entitled): E-bike is labelled Plus, and a tap
 *      opens the Plus sheet focused on e-bike instead of selecting it, so
 *      Continue does not store it.
 *   2. Entitled: E-bike selects like any other row and is stored.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

(globalThis as Record<string, unknown>).__DEV__ = false;

const { mockBlockEbike, mockFinish } = vi.hoisted(() => ({
  mockBlockEbike: vi.fn(),
  mockFinish: vi.fn(),
}));

vi.mock('../../hooks/usePremium', () => ({
  usePremium: () => ({
    blockEbikeRouting: mockBlockEbike,
    coolRouting: () => 'available',
  }),
}));

vi.mock('../../components/PlusPaywallHost', () => {
  const React = require('react');
  return {
    PlusPaywallHost: ({ visible, source, focus }: { visible: boolean; source: string; focus?: string }) =>
      visible ? React.createElement('div', null, `paywall:${source}:${focus}`) : null,
  };
});

vi.mock('../../lib/post-onboarding-nav', () => ({ finishPostSignupSteps: mockFinish }));
vi.mock('../../lib/telemetry', () => ({ telemetry: { capture: vi.fn() } }));

vi.mock('../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${Object.values(vars).join(',')}` : key,
}));

vi.mock('../../design-system', () => ({ useTheme: () => ({ colors: {} }) }));

vi.mock('../../design-system/atoms', () => {
  const React = require('react');
  const Pass = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  const Press = ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => React.createElement('button', { onClick: onPress, 'aria-label': accessibilityLabel }, children);
  return {
    Button: Press,
    PressableScale: Press,
    FadeSlideIn: Pass,
    Mascot: () => null,
  };
});

vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));

import OnboardingBikeTypeScreen from '../../../app/onboarding/bike-type';
import { useAppStore } from '../../store/appStore';

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ bikeTypeId: null, bikeTypePromptSeen: false });
});

describe('OnboardingBikeTypeScreen — E-bike is Pedal Plus', () => {
  it('opens Plus instead of selecting E-bike when locked', () => {
    mockBlockEbike.mockReturnValue(true);
    render(<OnboardingBikeTypeScreen />);

    fireEvent.click(screen.getByText('premium.plusOnlyOption:profile.bikeEbike'));
    expect(screen.getByText('paywall:bike_type:ebike')).toBeTruthy();

    fireEvent.click(screen.getByText('onboarding.bikeTypeContinue'));
    expect(useAppStore.getState().bikeTypeId).toBeNull();
  });

  it('selects and stores E-bike for an entitled rider', () => {
    mockBlockEbike.mockReturnValue(false);
    render(<OnboardingBikeTypeScreen />);

    fireEvent.click(screen.getByText('profile.bikeEbike'));
    expect(screen.queryByText(/^paywall:/)).toBeNull();

    fireEvent.click(screen.getByText('onboarding.bikeTypeContinue'));
    expect(useAppStore.getState().bikeTypeId).toBe('ebike');
  });
});
