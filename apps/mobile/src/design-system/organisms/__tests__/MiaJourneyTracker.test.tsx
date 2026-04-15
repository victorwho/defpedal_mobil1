// @vitest-environment happy-dom
/**
 * MiaJourneyTracker Organism — Unit Tests
 *
 * Tests node status (completed/current/locked), rides progress,
 * share button, and correct rendering for each level.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../tokens/miaColors', () => ({
  miaLevelColors: {
    level2: { primary: '#22C55E', secondary: '#4ADE80', particle: '#86EFAC' },
    level3: { primary: '#F59E0B', secondary: '#FBBF24', particle: '#FDE68A' },
    level4: { primary: '#3B82F6', secondary: '#60A5FA', particle: '#93C5FD' },
    level5: { primary: '#FACC15', secondary: '#FDE68A', particle: '#FEF9C3' },
  },
}));

vi.mock('../tokens/spacing', () => ({
  space: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36],
}));

vi.mock('../tokens/radii', () => ({
  radii: { sm: 4, md: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 },
}));

vi.mock('../tokens/shadows', () => ({
  shadows: { md: {} },
}));

vi.mock('../tokens/typography', () => ({
  fontFamily: {
    heading: { bold: 'System', semiBold: 'System', extraBold: 'System' },
    body: { regular: 'System', medium: 'System', semiBold: 'System' },
    mono: { bold: 'System', medium: 'System' },
  },
  textBase: { fontSize: 16 },
  textSm: { fontSize: 14 },
  textXs: { fontSize: 12 },
}));

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
      textMuted: '#8B9198',
      bgPrimary: '#1F2937',
      bgTertiary: '#4B5563',
      borderDefault: 'rgba(255,255,255,0.08)',
    },
  }),
}));

const MockIonicons = ({ name }: { name: string }) =>
  React.createElement('span', { 'data-testid': `icon-${name}` }, name);
(MockIonicons as any).glyphMap = {};
vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: MockIonicons,
}));

vi.mock('../atoms/FadeSlideIn', () => ({
  FadeSlideIn: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

const { MiaJourneyTracker } = await import('../MiaJourneyTracker');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MiaJourneyTracker', () => {
  describe('node states at different levels', () => {
    it('renders all 5 level names', () => {
      render(<MiaJourneyTracker currentLevel={1} totalRides={0} />);
      expect(screen.getByText('First Pedal')).toBeTruthy();
      expect(screen.getByText('Neighborhood Explorer')).toBeTruthy();
      expect(screen.getByText('Cafe Rider')).toBeTruthy();
      expect(screen.getByText('Urban Navigator')).toBeTruthy();
      expect(screen.getByText('Confident Cyclist')).toBeTruthy();
    });

    it('at level 3: nodes 1-2 show checkmarks', () => {
      render(<MiaJourneyTracker currentLevel={3} totalRides={4} />);
      expect(screen.getAllByTestId('icon-checkmark').length).toBe(2);
    });

    it('at level 3: completed levels show conquered text', () => {
      render(<MiaJourneyTracker currentLevel={3} totalRides={4} />);
      expect(screen.getByText('Quiet residential streets')).toBeTruthy();
      expect(screen.getByText('Moderate traffic segments')).toBeTruthy();
    });

    it('at level 5: nodes 1-4 show checkmarks', () => {
      render(<MiaJourneyTracker currentLevel={5} totalRides={12} />);
      expect(screen.getAllByTestId('icon-checkmark').length).toBe(4);
    });
  });

  describe('progress display', () => {
    it('shows rides progress for current level', () => {
      render(<MiaJourneyTracker currentLevel={2} totalRides={2} />);
      // Progress text: "2/3 rides to Level 3"
      expect(screen.getByText('2/3 rides to Level 3')).toBeTruthy();
    });

    it('shows unlock previews for locked levels', () => {
      render(<MiaJourneyTracker currentLevel={1} totalRides={0} />);
      expect(screen.getByText('Unlocks longer routes')).toBeTruthy();
      expect(screen.getByText('Unlocks destination riding')).toBeTruthy();
      expect(screen.getByText('Unlocks route preferences')).toBeTruthy();
      expect(screen.getByText('Full cyclist experience')).toBeTruthy();
    });
  });

  describe('share progress button', () => {
    it('renders share button when onShareProgress is provided', () => {
      const onShare = vi.fn();
      render(<MiaJourneyTracker currentLevel={2} totalRides={1} onShareProgress={onShare} />);
      expect(screen.getByText('Share your progress')).toBeTruthy();
      expect(screen.getByTestId('icon-share-social-outline')).toBeTruthy();
    });

    it('calls onShareProgress when clicked', () => {
      const onShare = vi.fn();
      render(<MiaJourneyTracker currentLevel={2} totalRides={1} onShareProgress={onShare} />);
      fireEvent.click(screen.getByText('Share your progress'));
      expect(onShare).toHaveBeenCalledTimes(1);
    });

    it('hides share button when onShareProgress is not provided', () => {
      render(<MiaJourneyTracker currentLevel={2} totalRides={1} />);
      expect(screen.queryByText('Share your progress')).toBeNull();
    });
  });

  describe('header', () => {
    it('renders journey title', () => {
      render(<MiaJourneyTracker currentLevel={1} totalRides={0} />);
      expect(screen.getByText('Your Cycling Journey')).toBeTruthy();
    });
  });
});
