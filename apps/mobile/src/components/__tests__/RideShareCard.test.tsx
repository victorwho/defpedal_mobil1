// @vitest-environment happy-dom
/**
 * RideShareCard Component — Unit Tests
 *
 * Tests deterministic rendering of the 1080x1080 offscreen share card:
 *   - Minimal props render without crashing
 *   - All 5 stat numbers render when all fields provided
 *   - Safety tile is hidden when safetyScore is undefined
 *   - Microlives tile is hidden when microlivesGained is undefined
 *   - origin/destination labels render when both provided
 *   - Ref is forwarded to the outermost View (truthy after mount)
 *   - Distance 5.37 -> "5.4 km", Duration 75 -> "1h 15m"
 */
import React, { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Extend the default react-native shim with an Image stub.
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native');
  const ReactMod = await import('react');
  const Image = ({
    source,
    style: _style,
    testID,
    accessibilityLabel,
    ...props
  }: {
    source?: { uri?: string };
    style?: unknown;
    testID?: string;
    accessibilityLabel?: string;
  }) =>
    ReactMod.createElement('img', {
      src: source?.uri,
      'data-testid': testID ?? 'rn-image',
      alt: accessibilityLabel ?? '',
      ...props,
    });
  return {
    ...actual,
    Image,
  };
});

vi.mock('../../design-system/tokens/colors', () => ({
  brandColors: {
    accent: '#FACC15',
    textInverse: '#111827',
    borderAccent: '#FACC15',
    borderStrong: '#4B5563',
  },
  darkTheme: {
    bgDeep: '#111827',
    textPrimary: '#FFFFFF',
    textSecondary: '#9CA3AF',
    textMuted: '#8B9198',
    borderDefault: 'rgba(255,255,255,0.08)',
  },
  gray: { 50: '#F9FAFB' },
}));

vi.mock('../../design-system/tokens/spacing', () => ({
  space: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36],
}));

vi.mock('../../design-system/tokens/radii', () => ({
  radii: { sm: 4, md: 8, lg: 12, xl: 16, '2xl': 20, full: 9999 },
}));

vi.mock('../../design-system/tokens/typography', () => ({
  fontFamily: {
    heading: { bold: 'System', semiBold: 'System', extraBold: 'System' },
    body: { regular: 'System', medium: 'System', semiBold: 'System', bold: 'System' },
    mono: { bold: 'System', medium: 'System', semiBold: 'System' },
  },
  text4xl: { fontSize: 36 },
  text3xl: { fontSize: 30 },
  text2xl: { fontSize: 24 },
  textXl: { fontSize: 20 },
  textLg: { fontSize: 18 },
  textBase: { fontSize: 16 },
  textSm: { fontSize: 14 },
  textXs: { fontSize: 12 },
  text2xs: { fontSize: 10 },
  textDataLg: { fontSize: 30 },
  textDataMd: { fontSize: 20 },
  textDataSm: { fontSize: 14 },
}));

vi.mock('../BrandLogo', () => ({
  BrandLogo: () => React.createElement('span', { 'data-testid': 'brand-logo' }, 'DP'),
}));

const { RideShareCard } = await import('../../components/share/RideShareCard');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAP_URL = 'https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+ff0000(26.1,44.4)/26.1,44.4,12/1080x560@2x';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RideShareCard', () => {
  it('renders without crashing with minimal props', () => {
    render(
      <RideShareCard
        mapImageUrl={MAP_URL}
        distanceKm={5}
        durationMinutes={30}
        co2SavedKg={1}
      />,
    );
    expect(screen.getByText('5.0 km')).toBeTruthy();
    expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('1.0 kg')).toBeTruthy();
  });

  it('renders all 5 stat numbers when every field is provided', () => {
    render(
      <RideShareCard
        mapImageUrl={MAP_URL}
        distanceKm={12.4}
        durationMinutes={45}
        co2SavedKg={2.3}
        safetyScore={87}
        microlivesGained={42}
      />,
    );
    expect(screen.getByText('12.4 km')).toBeTruthy();
    expect(screen.getByText('45 min')).toBeTruthy();
    expect(screen.getByText('2.3 kg')).toBeTruthy();
    expect(screen.getByText('87/100')).toBeTruthy();
    expect(screen.getByText('42 min')).toBeTruthy();
    // Labels also present
    expect(screen.getByText('Safety')).toBeTruthy();
    expect(screen.getByText('Life earned')).toBeTruthy();
  });

  it('hides the safety tile when safetyScore is undefined', () => {
    render(
      <RideShareCard
        mapImageUrl={MAP_URL}
        distanceKm={3}
        durationMinutes={10}
        co2SavedKg={0.5}
        microlivesGained={5}
      />,
    );
    expect(screen.queryByText('Safety')).toBeNull();
    // Microlives stays
    expect(screen.getByText('Life earned')).toBeTruthy();
  });

  it('hides the microlives tile when microlivesGained is undefined', () => {
    render(
      <RideShareCard
        mapImageUrl={MAP_URL}
        distanceKm={3}
        durationMinutes={10}
        co2SavedKg={0.5}
        safetyScore={90}
      />,
    );
    expect(screen.queryByText('Life earned')).toBeNull();
    expect(screen.getByText('Safety')).toBeTruthy();
  });

  it('renders origin and destination labels when both provided', () => {
    render(
      <RideShareCard
        mapImageUrl={MAP_URL}
        distanceKm={7}
        durationMinutes={25}
        co2SavedKg={1.4}
        originLabel="Home"
        destinationLabel="Work"
      />,
    );
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
  });

  it('omits the route label (shows muted fallback) when labels are missing', () => {
    render(
      <RideShareCard
        mapImageUrl={MAP_URL}
        distanceKm={2}
        durationMinutes={8}
        co2SavedKg={0.3}
      />,
    );
    expect(screen.queryByText('Home')).toBeNull();
    expect(screen.getByText('A ride on Defensive Pedal')).toBeTruthy();
  });

  it('forwards its ref to the outermost View', () => {
    const ref = createRef<unknown>();
    render(
      <RideShareCard
        ref={ref as React.Ref<unknown>}
        mapImageUrl={MAP_URL}
        distanceKm={1}
        durationMinutes={1}
        co2SavedKg={0.1}
      />,
    );
    expect(ref.current).toBeTruthy();
  });

  describe('formatting', () => {
    it('rounds distance 5.37 to "5.4 km"', () => {
      render(
        <RideShareCard
          mapImageUrl={MAP_URL}
          distanceKm={5.37}
          durationMinutes={30}
          co2SavedKg={1}
        />,
      );
      expect(screen.getByText('5.4 km')).toBeTruthy();
    });

    it('formats 75 minutes as "1h 15m"', () => {
      render(
        <RideShareCard
          mapImageUrl={MAP_URL}
          distanceKm={10}
          durationMinutes={75}
          co2SavedKg={2}
        />,
      );
      expect(screen.getByText('1h 15m')).toBeTruthy();
    });

    it('formats 60 minutes as "1h 0m"', () => {
      render(
        <RideShareCard
          mapImageUrl={MAP_URL}
          distanceKm={10}
          durationMinutes={60}
          co2SavedKg={2}
        />,
      );
      expect(screen.getByText('1h 0m')).toBeTruthy();
    });

    it('formats a date ISO into a readable pill label', () => {
      render(
        <RideShareCard
          mapImageUrl={MAP_URL}
          distanceKm={3}
          durationMinutes={10}
          co2SavedKg={0.5}
          dateIso="2026-04-17T10:00:00Z"
        />,
      );
      // Rendered date uses en-US "Apr 17, 2026" style
      expect(screen.getByText(/Apr 17, 2026/)).toBeTruthy();
    });
  });

  it('renders the Mapbox static image with the provided URL', () => {
    render(
      <RideShareCard
        mapImageUrl={MAP_URL}
        distanceKm={3}
        durationMinutes={10}
        co2SavedKg={0.5}
      />,
    );
    const img = screen.getByTestId('rn-image') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(MAP_URL);
  });
});
