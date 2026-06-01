// @vitest-environment node
import type { Step } from '@defensivepedal/core';
import { describe, expect, it } from 'vitest';

import { buildManeuverInstruction } from '../maneuverInstructions';

const makeStep = (type: string, modifier?: string, name = 'Strada Mare'): Step => ({
  intersections: [],
  maneuver: {
    bearing_after: 0,
    bearing_before: 0,
    location: [0, 0],
    type,
    ...(modifier ? { modifier } : {}),
  },
  name,
  duration: 10,
  distance: 50,
  driving_side: 'right',
  weight: 10,
  mode: 'cycling',
  geometry: { type: 'LineString', coordinates: [] },
});

describe('buildManeuverInstruction', () => {
  it('localizes a left turn in English', () => {
    expect(buildManeuverInstruction(makeStep('turn', 'left'), 'en')).toBe(
      'Turn left onto Strada Mare',
    );
  });

  it('localizes a left turn in Romanian', () => {
    expect(buildManeuverInstruction(makeStep('turn', 'left'), 'ro')).toBe(
      'Virează la stânga pe Strada Mare',
    );
  });

  it('localizes a right turn in Spanish', () => {
    expect(buildManeuverInstruction(makeStep('turn', 'right'), 'es')).toBe(
      'Gira a la derecha hacia Strada Mare',
    );
  });

  it('handles depart with a direction modifier', () => {
    expect(buildManeuverInstruction(makeStep('depart', 'straight'), 'en')).toBe(
      'Head straight on Strada Mare',
    );
  });

  it('handles depart without a modifier (no dangling direction)', () => {
    expect(buildManeuverInstruction(makeStep('depart'), 'ro')).toBe(
      'Pornește pe Strada Mare',
    );
  });

  it('arrive ignores street and direction', () => {
    expect(buildManeuverInstruction(makeStep('arrive'), 'es')).toBe(
      'Has llegado a tu destino',
    );
  });

  it('uses a dedicated phrase for U-turns instead of a turn template', () => {
    expect(buildManeuverInstruction(makeStep('turn', 'uturn'), 'en')).toBe(
      'Make a U-turn onto Strada Mare',
    );
  });

  it('falls back to the localized "the road" when the street is unnamed', () => {
    expect(buildManeuverInstruction(makeStep('continue', undefined, ''), 'ro')).toBe(
      'Continuă pe drum',
    );
  });

  it('maps slight modifiers to the slight direction word', () => {
    expect(buildManeuverInstruction(makeStep('fork', 'slight right'), 'en')).toBe(
      'Keep slight right onto Strada Mare',
    );
  });

  it('degrades unknown maneuver types to the generic phrase (no raw token leak)', () => {
    const result = buildManeuverInstruction(makeStep('notification', undefined, 'Main St'), 'en');
    expect(result).toBe('Continue straight onto Main St');
    expect(result).not.toContain('notification');
  });

  it('maps roundabout to the roundabout phrase', () => {
    expect(buildManeuverInstruction(makeStep('roundabout'), 'es')).toBe(
      'Entra en la rotonda hacia Strada Mare',
    );
  });
});
