// @vitest-environment happy-dom
/**
 * MiaLevelUpOverlay Organism — Unit Tests
 *
 * Tests rendering for all 4 level transitions, testimonial input at L4->5,
 * dismiss behavior, and share functionality.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../tokens/colors', () => ({
  brandColors: {
    accent: '#FACC15',
    textPrimary: '#FFFFFF',
    textSecondary: '#9CA3AF',
    textMuted: '#8B9198',
    textInverse: '#111827',
    bgPrimary: '#1F2937',
    bgTertiary: '#4B5563',
    borderAccent: '#FACC15',
  },
}));

vi.mock('../tokens/spacing', () => ({
  space: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36],
}));

vi.mock('../tokens/radii', () => ({
  radii: { sm: 4, md: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 },
}));

vi.mock('../tokens/typography', () => ({
  fontFamily: {
    heading: { bold: 'System', semiBold: 'System', extraBold: 'System' },
    body: { regular: 'System', medium: 'System', semiBold: 'System' },
    mono: { bold: 'System', medium: 'System' },
  },
  text2xl: { fontSize: 24 },
  textXl: { fontSize: 20 },
  textBase: { fontSize: 16 },
  textSm: { fontSize: 14 },
  textXs: { fontSize: 12 },
}));

vi.mock('../tokens/zIndex', () => ({
  zIndex: { supreme: 9999 },
}));

const MockIonicons = ({ name }: { name: string }) =>
  React.createElement('span', { 'data-testid': `icon-${name}` }, name);
(MockIonicons as any).glyphMap = {
  'shield-checkmark': 0, cafe: 0, compass: 0, star: 0,
  'share-social-outline': 0, 'checkmark-circle': 0,
};
vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: MockIonicons,
}));

const { MiaLevelUpOverlay } = await import('../MiaLevelUpOverlay');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MiaLevelUpOverlay', () => {
  describe('level transition rendering', () => {
    const transitions = [
      { from: 1 as const, to: 2 as const, icon: 'shield-checkmark', title: 'Level 2: Neighborhood Explorer' },
      { from: 2 as const, to: 3 as const, icon: 'cafe', title: 'Level 3: Cafe Rider' },
      { from: 3 as const, to: 4 as const, icon: 'compass', title: 'Level 4: Urban Navigator' },
      { from: 4 as const, to: 5 as const, icon: 'star', title: 'Confident Cyclist' },
    ];

    for (const { from, to, icon, title } of transitions) {
      it(`renders level ${from}→${to} with ${icon} icon and title`, () => {
        const { unmount } = render(
          <MiaLevelUpOverlay fromLevel={from} toLevel={to} onDismiss={vi.fn()} />,
        );
        expect(screen.getByTestId(`icon-${icon}`)).toBeTruthy();
        expect(screen.getByText(title)).toBeTruthy();
        unmount();
      });
    }
  });

  describe('dismiss behavior', () => {
    it('non-testimonial levels: shows "Tap to dismiss"', () => {
      render(
        <MiaLevelUpOverlay fromLevel={1} toLevel={2} onDismiss={vi.fn()} />,
      );
      expect(screen.getByText('Tap to dismiss')).toBeTruthy();
    });

    it('level 4→5: shows Done button instead of tap dismiss', () => {
      render(
        <MiaLevelUpOverlay fromLevel={4} toLevel={5} onDismiss={vi.fn()} />,
      );
      expect(screen.getByText('Done')).toBeTruthy();
      expect(screen.queryByText('Tap to dismiss')).toBeNull();
    });
  });

  describe('testimonial input (level 4→5)', () => {
    it('shows testimonial prompt', () => {
      render(
        <MiaLevelUpOverlay fromLevel={4} toLevel={5} onDismiss={vi.fn()} />,
      );
      expect(screen.getByText("What would you tell someone who's nervous about cycling?")).toBeTruthy();
    });

    it('shows character counter starting at 0/280', () => {
      render(
        <MiaLevelUpOverlay fromLevel={4} toLevel={5} onDismiss={vi.fn()} />,
      );
      expect(screen.getByText('0/280')).toBeTruthy();
    });

    it('shows Submit button', () => {
      render(
        <MiaLevelUpOverlay fromLevel={4} toLevel={5} onDismiss={vi.fn()} />,
      );
      expect(screen.getByText('Submit')).toBeTruthy();
    });

    it('calls onTestimonialSubmit with trimmed text on submit', () => {
      const onSubmit = vi.fn();
      render(
        <MiaLevelUpOverlay
          fromLevel={4}
          toLevel={5}
          onDismiss={vi.fn()}
          onTestimonialSubmit={onSubmit}
        />,
      );
      const input = screen.getByPlaceholderText('What surprised you most about your first rides?');
      fireEvent.change(input, { target: { value: '  Great journey!  ' } });
      fireEvent.click(screen.getByText('Submit'));
      expect(onSubmit).toHaveBeenCalledWith('Great journey!');
    });

    it('shows "Sent!" after submission', () => {
      const onSubmit = vi.fn();
      render(
        <MiaLevelUpOverlay
          fromLevel={4}
          toLevel={5}
          onDismiss={vi.fn()}
          onTestimonialSubmit={onSubmit}
        />,
      );
      const input = screen.getByPlaceholderText('What surprised you most about your first rides?');
      fireEvent.change(input, { target: { value: 'Test' } });
      fireEvent.click(screen.getByText('Submit'));
      expect(screen.getByText('Sent!')).toBeTruthy();
    });

    it('hides testimonial UI for non L4→5 transitions', () => {
      render(
        <MiaLevelUpOverlay fromLevel={2} toLevel={3} onDismiss={vi.fn()} />,
      );
      expect(screen.queryByText("What would you tell someone who's nervous about cycling?")).toBeNull();
    });
  });

  describe('share button', () => {
    it('renders Share button with icon', () => {
      render(
        <MiaLevelUpOverlay fromLevel={1} toLevel={2} onDismiss={vi.fn()} />,
      );
      expect(screen.getByText('Share')).toBeTruthy();
      expect(screen.getByTestId('icon-share-social-outline')).toBeTruthy();
    });
  });

  describe('fallback variant', () => {
    it('uses 1to2 variant for unknown transitions', () => {
      render(
        <MiaLevelUpOverlay fromLevel={5 as any} toLevel={5 as any} onDismiss={vi.fn()} />,
      );
      expect(screen.getByTestId('icon-shield-checkmark')).toBeTruthy();
    });
  });
});
