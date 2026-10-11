import { describe, expect, it } from 'vitest';
import type { NavigationStep } from '@defensivepedal/core';

import { cueIconName, cueShortLabel, cueText, isCueOnlyStep, spokenInstruction } from './walkCues';

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${Object.values(vars).join(',')})` : key;

const step = (overrides: Partial<NavigationStep>): NavigationStep => ({
  id: 's',
  instruction: 'Turn left onto Strada X',
  streetName: 'Strada X',
  distanceMeters: 100,
  durationSeconds: 30,
  maneuver: { type: 'turn', location: [0, 0], bearing_before: 0, bearing_after: 0 } as NavigationStep['maneuver'],
  mode: 'cycling',
  ...overrides,
});

describe('walk cues', () => {
  it('leaves an ordinary step exactly as it was', () => {
    const plain = step({});
    expect(cueText(plain, t, 'metric')).toBeNull();
    expect(isCueOnlyStep(plain)).toBe(false);
    expect(spokenInstruction(plain, t, 'metric')).toBe('Turn left onto Strada X');
  });

  it('keeps a real turn and adds the dismount cue beneath it, distance spoken as words', () => {
    const s = step({ walkCue: 'dismount', walkMeters: 120 });
    expect(isCueOnlyStep(s)).toBe(false);
    expect(cueText(s, t, 'metric')).toBe('nav.walkDismount(120 m)');
    expect(spokenInstruction(s, t, 'metric')).toBe(
      'nav.walkWithCue(Turn left onto Strada X,nav.walkDismount(120 common.unitMeters))',
    );
  });

  it('shows only the cue on a mode-change step, which has no maneuver of its own', () => {
    const s = step({ walkCue: 'ride_again', maneuver: { ...step({}).maneuver, type: 'notification' } });
    expect(isCueOnlyStep(s)).toBe(true);
    expect(cueShortLabel(s, t)).toBe('nav.walkRideAgainShort');
    expect(cueIconName(s)).toBe('bicycle');
    expect(spokenInstruction(s, t, 'metric')).toBe('nav.walkRideAgain');
  });

  it('marks a crossing lightly on the maneuver the rider approaches it under', () => {
    const s = step({ walkCue: 'cross_on_foot' });
    expect(cueText(s, t, 'metric')).toBe('nav.walkCrossOnFoot');
    expect(cueIconName(s)).toBe('walk');
  });
});
