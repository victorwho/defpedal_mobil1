// @vitest-environment happy-dom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the icon import — @expo/vector-icons has Flow syntax Vite can't parse.
vi.mock('@expo/vector-icons/Ionicons', () => ({
  default: ({ name, testID }: { name: string; testID?: string }) =>
    React.createElement('span', { 'data-icon': name, 'data-testid': testID ?? name }, name),
}));

vi.mock('../../../store/appStore', () => ({
  useAppStore: (selector: (s: { showMascot: boolean; appState: string }) => unknown) =>
    selector({ showMascot: true, appState: 'IDLE' }),
}));

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

import { StreakFlame } from '../StreakFlame';

describe('StreakFlame', () => {
  it('renders the streak number', () => {
    render(<StreakFlame streakDays={7} />);
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('renders dormant state at 0 days', () => {
    render(<StreakFlame streakDays={0} showLabel />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('Dormant')).toBeTruthy();
  });

  it('shows the tier label at day 7 (Spark)', () => {
    render(<StreakFlame streakDays={7} showLabel />);
    expect(screen.getByText('Spark')).toBeTruthy();
  });

  it('shows the tier label at day 100 (Century)', () => {
    render(<StreakFlame streakDays={100} showLabel />);
    expect(screen.getByText('Century')).toBeTruthy();
  });

  it('shows the tier label at day 365 (Legend)', () => {
    render(<StreakFlame streakDays={365} showLabel />);
    expect(screen.getByText('Legend')).toBeTruthy();
  });

  it('uses numberOverride when provided', () => {
    render(<StreakFlame streakDays={5} numberOverride={6} />);
    expect(screen.getByText('6')).toBeTruthy();
  });
});
