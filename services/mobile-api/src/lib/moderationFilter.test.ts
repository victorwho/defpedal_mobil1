// Review finding G-26: the prefilter only knew English and Romanian while
// the app has shipped a Spanish UI since 2026-05. These tests pin the
// Spanish coverage AND — more importantly — the false-positive boundary:
// ordinary Spanish words that merely LOOK like slurs must pass through, or
// the moderation queue drowns and real reports get buried.
//
// Convention: assert on categories and on benign text. Positive cases use
// the smallest representative sample per branch rather than reproducing the
// wordlist (see the module header on keeping slurs out of source control).
import { describe, expect, it } from 'vitest';

import { checkContentAgainstFilter } from './moderationFilter';

const categoryOf = (text: string) => checkContentAgainstFilter(text).category;

describe('checkContentAgainstFilter — neutral content', () => {
  it('passes empty and ordinary text', () => {
    expect(checkContentAgainstFilter('')).toMatchObject({ flagged: false });
    expect(
      checkContentAgainstFilter('Great route along the river, very few cars.'),
    ).toMatchObject({ flagged: false, category: null, pattern: null });
  });

  it('passes ordinary Spanish cycling comments', () => {
    for (const text of [
      'Ruta preciosa por el carril bici del río. Muy tranquila.',
      'Cuidado con el bache en la esquina, casi me mato con la bici.',
      'El tramo de subida es duro pero merece la pena.',
    ]) {
      expect(checkContentAgainstFilter(text).flagged, text).toBe(false);
    }
  });

  it('does not flag ethnonyms and colour words used normally (ES)', () => {
    // `moro`, `gitano` and `negro` are ordinary Spanish words; only the
    // abusive compounds are patterns. Over-flagging these would be worse
    // than missing them.
    for (const text of [
      'Fiestas de Moros y Cristianos en el centro, calles cortadas.',
      'El barrio gitano organiza una ruta en bici el domingo.',
      'Mi casco es negro y el maillot también.',
      'Quedamos en la calle Moro a las ocho.',
    ]) {
      expect(checkContentAgainstFilter(text).flagged, text).toBe(false);
    }
  });
});

describe('checkContentAgainstFilter — Spanish slurs (G-26)', () => {
  it('flags a standalone ethnic slur', () => {
    expect(categoryOf('vete de aqui sudaca')).toBe('slur');
  });

  it('flags an ethnonym inside an abusive compound', () => {
    expect(categoryOf('ese moro de mierda me cerro el carril')).toBe('slur');
  });

  it('flags homophobic and ableist insults', () => {
    expect(categoryOf('no seas maricon')).toBe('slur');
    expect(categoryOf('eres subnormal')).toBe('slur');
  });

  it('matches accented and plural forms', () => {
    expect(categoryOf('sois unos maricones')).toBe('slur');
    expect(categoryOf('menudo mongólico')).toBe('slur');
  });

  it('reports the matching pattern source for the review queue', () => {
    const result = checkContentAgainstFilter('vete de aqui sudaca');
    expect(result.flagged).toBe(true);
    expect(result.pattern).toBeTruthy();
  });
});

describe('checkContentAgainstFilter — Spanish threats (G-26)', () => {
  it('flags direct threats of violence', () => {
    for (const text of [
      'te voy a matar cuando te vea',
      'voy a reventarte la bici y a ti',
      'como te pille te parto la cara',
      'te mato si vuelves por aqui',
    ]) {
      expect(categoryOf(text), text).toBe('threat');
    }
  });

  it('flags the "kill yourself" analogues', () => {
    expect(categoryOf('matate ya')).toBe('threat');
    expect(categoryOf('muérete')).toBe('threat');
  });

  it('still flags the English and Romanian threats', () => {
    expect(categoryOf('kill yourself')).toBe('threat');
    expect(categoryOf('te omor')).toBe('threat');
  });

  it('does not flag "casi me mato" (an accident, not a threat)', () => {
    expect(checkContentAgainstFilter('casi me mato en esa curva').flagged).toBe(false);
  });
});

describe('checkContentAgainstFilter — doxxing', () => {
  it('flags Spanish mobile numbers with the country prefix', () => {
    expect(categoryOf('llamame al +34 612 345 678')).toBe('doxx');
    expect(categoryOf('mi movil es 34 712345678')).toBe('doxx');
  });

  it('still flags Romanian mobiles and generic 10-digit numbers', () => {
    expect(categoryOf('suna-ma la +40 721 234 567')).toBe('doxx');
    expect(categoryOf('call 555 123 4567')).toBe('doxx');
  });

  it('does not flag short numbers like distances or times', () => {
    expect(checkContentAgainstFilter('12 km en 45 min, media de 16 km/h').flagged).toBe(
      false,
    );
  });
});
