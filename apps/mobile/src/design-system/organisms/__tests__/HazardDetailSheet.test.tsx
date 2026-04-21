// @vitest-environment happy-dom
/**
 * HazardDetailSheet Organism — Unit Tests
 *
 * Covers: visibility gating, backdrop dismiss, vote button callbacks.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NearbyHazard } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// React Native's PanResponder isn't available in happy-dom — stub it out.
// `Modal` is also broken under RN web + happy-dom (it forwards children with
// `pointerEvents`, producing DOM warnings but still renders). Replace both
// with identity stubs so the sheet renders its children flatly for assertion.
vi.mock('react-native', async () => {
  const actual: any = await vi.importActual('react-native');
  return {
    ...actual,
    PanResponder: {
      create: () => ({ panHandlers: {} }),
    },
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? React.createElement('div', { 'data-testid': 'modal' }, children) : null,
  };
});

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark',
    colors: {
      bgPrimary: '#1F2937',
      bgSecondary: '#374151',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
      borderDefault: '#4B5563',
    },
  }),
}));

vi.mock('../../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) => {
    if (vars && Object.keys(vars).length > 0) {
      return `${key}:${JSON.stringify(vars)}`;
    }
    return key;
  },
}));

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}`, ...props }),
    ),
  };
});

const { HazardDetailSheet } = await import('../HazardDetailSheet');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const hazard: NearbyHazard = {
  id: 'hz-42',
  lat: 44.43,
  lon: 26.1,
  hazardType: 'pothole',
  createdAt: '2026-04-20T08:00:00.000Z',
  confirmCount: 6,
  denyCount: 1,
  score: 5,
  userVote: null,
  expiresAt: '2026-05-04T08:00:00.000Z',
  lastConfirmedAt: '2026-04-20T12:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HazardDetailSheet', () => {
  it('renders the hazard score when visible', () => {
    render(
      <HazardDetailSheet
        hazard={hazard}
        visible
        onDismiss={vi.fn()}
        onVote={vi.fn()}
      />,
    );
    expect(screen.getByText('+5')).toBeTruthy();
  });

  it('returns null and renders no backdrop when no hazard is selected', () => {
    const { container } = render(
      <HazardDetailSheet
        hazard={null}
        visible
        onDismiss={vi.fn()}
        onVote={vi.fn()}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('fires onVote("up") when the upvote button is pressed', () => {
    const onVote = vi.fn();
    render(
      <HazardDetailSheet
        hazard={hazard}
        visible
        onDismiss={vi.fn()}
        onVote={onVote}
      />,
    );
    fireEvent.click(screen.getByLabelText('hazard.upvoteLabel'));
    expect(onVote).toHaveBeenCalledWith('up');
  });

  it('fires onVote("down") when the downvote button is pressed', () => {
    const onVote = vi.fn();
    render(
      <HazardDetailSheet
        hazard={hazard}
        visible
        onDismiss={vi.fn()}
        onVote={onVote}
      />,
    );
    fireEvent.click(screen.getByLabelText('hazard.downvoteLabel'));
    expect(onVote).toHaveBeenCalledWith('down');
  });

  it('does not fire onVote when voteState is pending', () => {
    const onVote = vi.fn();
    render(
      <HazardDetailSheet
        hazard={hazard}
        visible
        voteState="pending"
        onDismiss={vi.fn()}
        onVote={onVote}
      />,
    );
    fireEvent.click(screen.getByLabelText('hazard.upvoteLabel'));
    fireEvent.click(screen.getByLabelText('hazard.downvoteLabel'));
    expect(onVote).not.toHaveBeenCalled();
  });

  it('fires onDismiss when the close button is tapped', () => {
    const onDismiss = vi.fn();
    render(
      <HazardDetailSheet
        hazard={hazard}
        visible
        onDismiss={onDismiss}
        onVote={vi.fn()}
      />,
    );
    // Close buttons use the shared `common.close` label.
    const closes = screen.getAllByLabelText('common.close');
    expect(closes.length).toBeGreaterThan(0);
    fireEvent.click(closes[0]!);
    expect(onDismiss).toHaveBeenCalled();
  });
});
