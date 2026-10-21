// @vitest-environment happy-dom
/**
 * Profile > Commute (docs/plans/commute-mode.md, step 5). Turning the briefing
 * on IS the setup: permission first, then a departure time, which has no
 * default. Without both, Commute stays off.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

(globalThis as Record<string, unknown>).__DEV__ = false;

const { mockEnsurePermission, mockCapture } = vi.hoisted(() => ({
  mockEnsurePermission: vi.fn(),
  mockCapture: vi.fn(),
}));

vi.mock('../../lib/push-notifications', () => ({ ensureNotificationPermissionAsync: mockEnsurePermission }));
vi.mock('../../lib/telemetry', () => ({ telemetry: { capture: mockCapture } }));
vi.mock('expo-router', () => ({ router: { back: vi.fn(), push: vi.fn() } }));
vi.mock('@expo/vector-icons/Ionicons', () => ({ default: () => null }));
vi.mock('../../design-system', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('../../hooks/useTranslation', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key}:${Object.values(vars).join(',')}` : key,
}));

vi.mock('../../components/Screen', () => {
  const React = require('react');
  return { Screen: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children) };
});

vi.mock('../../design-system/molecules/SettingRow', () => {
  const React = require('react');
  return {
    SettingRow: (p: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) =>
      React.createElement(
        'button',
        { 'aria-label': p.label, disabled: p.disabled, 'data-checked': String(p.checked), onClick: () => p.onChange(!p.checked) },
        p.description,
      ),
  };
});

vi.mock('../../components/CommuteTimePicker', () => {
  const React = require('react');
  return {
    CommuteTimePicker: (p: { visible: boolean; title: string; onSelect: (t: string) => void; onClose: () => void }) =>
      p.visible
        ? React.createElement(
            'div',
            null,
            React.createElement('span', null, p.title),
            React.createElement('button', { onClick: () => { p.onSelect('07:30'); p.onClose(); } }, 'pick-07:30'),
            React.createElement('button', { onClick: p.onClose }, 'close-picker'),
          )
        : null,
  };
});

vi.mock('../../components/CommutePlaceSearch', () => {
  const React = require('react');
  return {
    CommutePlaceSearch: (p: { label: string; onPicked: (place: unknown) => void }) =>
      React.createElement(
        'button',
        { onClick: () => p.onPicked({ id: 'x', label: 'Str. Noua 1', primaryText: 'Str. Noua 1', coordinates: { lat: 44.4, lon: 26.1 } }) },
        `search:${p.label}`,
      ),
  };
});

import CommuteScreen from '../../../app/commute';
import { useAppStore } from '../../store/appStore';
import { DEFAULT_COMMUTE_SLICE_STATE } from '../../store/commuteSlice';

const HOME = { id: 'h', label: 'Home st', primaryText: 'Home st', coordinates: { lat: 44.43, lon: 26.1 } };
const WORK = { id: 'w', label: 'Work st', primaryText: 'Work st', coordinates: { lat: 44.45, lon: 26.08 } };

const toggle = () => screen.getByLabelText('commuteScreen.toggle');
const commute = () => useAppStore.getState().commute;
const clickToggle = async () => {
  await act(async () => {
    fireEvent.click(toggle());
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsurePermission.mockResolvedValue(true);
  useAppStore.setState({ ...DEFAULT_COMMUTE_SLICE_STATE, savedPlaces: { home: HOME, work: WORK } });
});

describe('CommuteScreen setup', () => {
  it('cannot be turned on until Home and Work are set', () => {
    useAppStore.setState({ savedPlaces: { home: HOME, work: null } });
    render(<CommuteScreen />);
    expect((toggle() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('commuteScreen.needsPlaces')).toBeTruthy();
  });

  it('asks permission, then the departure time, then turns on', async () => {
    render(<CommuteScreen />);
    await clickToggle();
    expect(mockEnsurePermission).toHaveBeenCalledTimes(1);
    expect(commute().enabled).toBe(false);
    expect(screen.getByText('commuteScreen.setupTitle')).toBeTruthy();

    fireEvent.click(screen.getByText('pick-07:30'));
    expect(commute()).toMatchObject({ enabled: true, departTime: '07:30' });
    expect(mockCapture).toHaveBeenCalledWith('commute_enabled', { days: 5, evening: false });
  });

  it('stays off when setup is closed without a time', async () => {
    render(<CommuteScreen />);
    await clickToggle();
    fireEvent.click(screen.getByText('close-picker'));
    expect(commute().enabled).toBe(false);
    expect(commute().departTime).toBeNull();
  });

  it('stays off and says why when permission is refused', async () => {
    mockEnsurePermission.mockResolvedValue(false);
    render(<CommuteScreen />);
    await clickToggle();
    expect(commute().enabled).toBe(false);
    expect(screen.queryByText('commuteScreen.setupTitle')).toBeNull();
    expect(screen.getByText('commuteScreen.permissionDenied')).toBeTruthy();
  });

  it('turns straight on when a departure time already exists, and off again', async () => {
    useAppStore.getState().setCommuteDepartTime('08:00');
    render(<CommuteScreen />);
    await clickToggle();
    expect(commute()).toMatchObject({ enabled: true, departTime: '08:00' });

    await clickToggle();
    expect(commute().enabled).toBe(false);
    expect(mockCapture).toHaveBeenCalledWith('commute_disabled');
  });
});

describe('CommuteScreen settings', () => {
  it('toggles days but never empties the week', () => {
    useAppStore.getState().setCommuteDays([1]);
    render(<CommuteScreen />);
    fireEvent.click(screen.getByLabelText('commuteScreen.day3'));
    expect(commute().days).toEqual([1, 3]);
    fireEvent.click(screen.getByLabelText('commuteScreen.day3'));
    fireEvent.click(screen.getByLabelText('commuteScreen.day1'));
    expect(commute().days).toEqual([1]);
  });

  it('evening briefing asks for a return time, and can be turned off', () => {
    render(<CommuteScreen />);
    fireEvent.click(screen.getByLabelText('commuteScreen.evening'));
    expect(screen.getByText('commuteScreen.returnSetupTitle')).toBeTruthy();
    fireEvent.click(screen.getByText('pick-07:30'));
    expect(commute().returnTime).toBe('07:30');
    expect(commute().departTime).toBeNull();

    fireEvent.click(screen.getByLabelText('commuteScreen.evening'));
    expect(commute().returnTime).toBeNull();
  });

  it('sets an unset place from the search', () => {
    useAppStore.setState({ savedPlaces: { home: HOME, work: null } });
    render(<CommuteScreen />);
    fireEvent.click(screen.getByText('commuteScreen.set'));
    fireEvent.click(screen.getByText('search:commuteScreen.searchLabel:search.work'));
    expect(useAppStore.getState().savedPlaces.work?.primaryText).toBe('Str. Noua 1');
  });
});
