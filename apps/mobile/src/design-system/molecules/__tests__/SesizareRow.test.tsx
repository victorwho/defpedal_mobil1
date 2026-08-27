// @vitest-environment happy-dom
/**
 * SesizareRow — Unit Tests
 *
 * The row is the single gate for every sesizare surface, so what it REFUSES
 * to render matters more than what it renders.
 */
import React, { type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type GeocodeResult = { address: string; countryCode: string } | null;

// NOTE: no explicit generic on vi.fn() — in a .tsx file `vi.fn<T>()` is
// parsed as JSX and fails to compile. Infer the shape from the impl instead.
const reverseGeocodeSpy = vi.fn(
  async (_lat: number, _lon: number): Promise<GeocodeResult> => null,
);
const startSesizareSpy = vi.fn();

// `@expo/vector-icons` cannot be parsed by vitest's bundler (it pulls every
// icon family at module load). Same stub the HazardDetailSheet test uses.
vi.mock('@expo/vector-icons/Ionicons', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      ReactModule.createElement('span', { 'data-testid': `icon-${props.name}` }),
  };
});

vi.mock('../../../lib/mapbox-search', () => ({
  reverseGeocodeAddressWithCountry: (lat: number, lon: number) => reverseGeocodeSpy(lat, lon),
}));

vi.mock('../../../hooks/useSesizare', () => ({
  useSesizare: () => ({ startSesizare: startSesizareSpy, isStarting: false }),
}));

vi.mock('../../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

vi.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({
    confirm: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    light: vi.fn(),
    selection: vi.fn(),
    impact: vi.fn(),
  }),
}));

import { SesizareRow } from '../SesizareRow';
import { useAppStore } from '../../../store/appStore';

const BUCHAREST = { lat: 44.4612, lon: 26.1109 };

const renderRow = (props: Partial<React.ComponentProps<typeof SesizareRow>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return render(
    <SesizareRow
      hazardType="pothole"
      coordinate={BUCHAREST}
      hazardId="haz-1"
      surface="hazard_detail"
      {...props}
    />,
    { wrapper },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  reverseGeocodeSpy.mockResolvedValue({
    address: 'strada Fabrica de Glucoză nr. 5, București',
    countryCode: 'RO',
  });
  useAppStore.setState({
    sesizariConfig: { enabled: true, baseUrl: 'https://civia.ro/sesizari' },
  });
});

describe('SesizareRow', () => {
  it('renders the CTA for an actionable Romanian hazard', async () => {
    renderRow();
    expect(await screen.findByText('sesizare.cta')).toBeTruthy();
  });

  it('renders nothing for a hazard type no authority can act on', async () => {
    const { container } = renderRow({ hazardType: 'aggressive_traffic' });
    expect(container.textContent).toBe('');
    expect(reverseGeocodeSpy).not.toHaveBeenCalled();
  });

  it('renders nothing outside Romania', async () => {
    reverseGeocodeSpy.mockResolvedValue({ address: 'Knez Mihailova 1', countryCode: 'RS' });
    const { container } = renderRow();
    // Give the query a tick to settle; the row must still be absent.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe('');
  });

  it('renders nothing when this rider already escalated the hazard', async () => {
    const { container } = renderRow({ sesizareByMe: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe('');
  });

  it('renders nothing when the kill switch is off', async () => {
    useAppStore.setState({
      sesizariConfig: { enabled: false, baseUrl: 'https://civia.ro/sesizari' },
    });
    const { container } = renderRow();
    expect(container.textContent).toBe('');
    expect(reverseGeocodeSpy).not.toHaveBeenCalled();
  });

  it('surfaces how many other riders already escalated it', async () => {
    renderRow({ sesizareCount: 2 });
    expect(await screen.findByText('sesizare.othersEscalated_other:{"count":2}')).toBeTruthy();
  });

  it('uses the singular string for exactly one other rider', async () => {
    renderRow({ sesizareCount: 1 });
    expect(await screen.findByText('sesizare.othersEscalated_one:{"count":1}')).toBeTruthy();
  });

  it('hands the resolved address to the sesizare flow on press', async () => {
    renderRow({ observedAt: '2026-08-27T09:14:00.000Z' });
    const cta = await screen.findByText('sesizare.cta');
    fireEvent.click(cta);

    expect(startSesizareSpy).toHaveBeenCalledWith({
      hazardType: 'pothole',
      coordinate: BUCHAREST,
      address: 'strada Fabrica de Glucoză nr. 5, București',
      hazardId: 'haz-1',
      observedAt: '2026-08-27T09:14:00.000Z',
      surface: 'hazard_detail',
    });
  });
});
