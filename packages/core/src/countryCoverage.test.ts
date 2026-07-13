import { describe, expect, it } from 'vitest';

import { SUPPORTED_APP_COUNTRIES } from './appAvailability';
import {
  ROUTING_COVERED_COUNTRIES,
  isRouteSupported,
  resolveCountryFromCoord,
} from './countryCoverage';

describe('routing coverage ↔ region gate sync', () => {
  it('COUNTRY_BBOXES covers exactly the SUPPORTED_APP_COUNTRIES set', () => {
    // A country the gate admits must be routable, and vice versa. Enforced
    // here (not by a runtime throw) so a drift fails CI, not app launch.
    expect(ROUTING_COVERED_COUNTRIES.length).toBe(SUPPORTED_APP_COUNTRIES.size);
    for (const country of ROUTING_COVERED_COUNTRIES) {
      expect(SUPPORTED_APP_COUNTRIES.has(country)).toBe(true);
    }
  });
});

describe('resolveCountryFromCoord', () => {
  it('resolves Bucharest to RO', () => {
    expect(resolveCountryFromCoord({ lat: 44.4268, lon: 26.1025 })).toBe('RO');
  });

  it('resolves Madrid to ES', () => {
    expect(resolveCountryFromCoord({ lat: 40.4168, lon: -3.7038 })).toBe('ES');
  });

  it('resolves Palma de Mallorca (Balearics) to ES', () => {
    expect(resolveCountryFromCoord({ lat: 39.5696, lon: 2.6502 })).toBe('ES');
  });

  it('resolves the Spanish North-African exclaves to ES (gate/routing consistency)', () => {
    // Ceuta and Melilla are ISO-ES, so they pass the availability gate —
    // the routing bboxes must agree or the app contradicts itself.
    expect(resolveCountryFromCoord({ lat: 35.8894, lon: -5.3213 })).toBe('ES'); // Ceuta
    expect(resolveCountryFromCoord({ lat: 35.2923, lon: -2.9381 })).toBe('ES'); // Melilla
  });

  it('resolves the newly covered EU capitals', () => {
    expect(resolveCountryFromCoord({ lat: 48.8566, lon: 2.3522 })).toBe('FR'); // Paris
    expect(resolveCountryFromCoord({ lat: 52.52, lon: 13.405 })).toBe('DE'); // Berlin
    expect(resolveCountryFromCoord({ lat: 48.2082, lon: 16.3738 })).toBe('AT'); // Vienna
    expect(resolveCountryFromCoord({ lat: 52.2297, lon: 21.0122 })).toBe('PL'); // Warsaw
    expect(resolveCountryFromCoord({ lat: 59.3293, lon: 18.0686 })).toBe('SE'); // Stockholm
    expect(resolveCountryFromCoord({ lat: 53.3498, lon: -6.2603 })).toBe('IE'); // Dublin
  });

  it('resolves EEA + CH capitals and island states', () => {
    expect(resolveCountryFromCoord({ lat: 64.1466, lon: -21.9426 })).toBe('IS'); // Reykjavik
    expect(resolveCountryFromCoord({ lat: 59.9139, lon: 10.7522 })).toBe('NO'); // Oslo
    expect(resolveCountryFromCoord({ lat: 35.1856, lon: 33.3823 })).toBe('CY'); // Nicosia
    expect(resolveCountryFromCoord({ lat: 35.8989, lon: 14.5146 })).toBe('MT'); // Valletta
    expect(resolveCountryFromCoord({ lat: 42.6977, lon: 23.3219 })).toBe('BG'); // Sofia
    expect(resolveCountryFromCoord({ lat: 37.9838, lon: 23.7275 })).toBe('GR'); // Athens
    expect(resolveCountryFromCoord({ lat: 35.3387, lon: 25.1442 })).toBe('GR'); // Heraklion (Crete)
    expect(resolveCountryFromCoord({ lat: 41.9028, lon: 12.4964 })).toBe('IT'); // Rome
    expect(resolveCountryFromCoord({ lat: 38.1157, lon: 13.3615 })).toBe('IT'); // Palermo (Sicily)
    expect(resolveCountryFromCoord({ lat: 41.9264, lon: 8.7369 })).toBe('FR'); // Ajaccio (Corsica)
  });

  it('resolves overlap zones to SOME supported country (attribution is cosmetic)', () => {
    // Zurich sits inside both the DE and CH loose boxes; Vaduz inside
    // AT/LI/CH. Which one wins is first-match and does not matter — every
    // supported country dispatches to the same EU graph. What matters is
    // that the point is IN coverage.
    expect(resolveCountryFromCoord({ lat: 47.3769, lon: 8.5417 })).not.toBeNull(); // Zurich
    expect(resolveCountryFromCoord({ lat: 47.141, lon: 9.5209 })).not.toBeNull(); // Vaduz
    // Iberia is inseparable by bboxes (Spanish Galicia reaches further west
    // than Lisbon) — Portugal attributes as 'ES'. Deliberate: ES-first keeps
    // the risk-comparison label precise for Spain; PT has no risk data, so
    // the mislabel is a graceful no-op.
    expect(resolveCountryFromCoord({ lat: 38.7223, lon: -9.1393 })).not.toBeNull(); // Lisbon
  });

  it('keeps RO attribution precise in the HU/BG overlap zones (risk-data features)', () => {
    // RO is listed first so the safe-vs-fast comparison (RO/ES-only) keeps
    // firing for riders in western/southern Romania.
    expect(resolveCountryFromCoord({ lat: 47.0722, lon: 21.9217 })).toBe('RO'); // Oradea
    expect(resolveCountryFromCoord({ lat: 43.9037, lon: 25.9699 })).toBe('RO'); // Giurgiu
  });

  it('returns null for Izmir (Turkish Aegean coast, outside the trimmed GR boxes)', () => {
    expect(resolveCountryFromCoord({ lat: 38.4237, lon: 27.1428 })).toBeNull();
  });

  it('returns null for Las Palmas (Canary Islands, no graph data)', () => {
    expect(resolveCountryFromCoord({ lat: 28.1248, lon: -15.43 })).toBeNull();
  });

  it('returns null for London (UK deliberately outside coverage)', () => {
    expect(resolveCountryFromCoord({ lat: 51.5074, lon: -0.1278 })).toBeNull();
  });

  it('returns null for Kyiv and Istanbul (outside coverage)', () => {
    expect(resolveCountryFromCoord({ lat: 50.4501, lon: 30.5234 })).toBeNull();
    expect(resolveCountryFromCoord({ lat: 41.0082, lon: 28.9784 })).toBeNull();
  });

  it('returns null for mid-Atlantic (no country)', () => {
    expect(resolveCountryFromCoord({ lat: 30, lon: -30 })).toBeNull();
  });

  it('returns null for the null island (invalid GPS)', () => {
    expect(resolveCountryFromCoord({ lat: 0, lon: 0 })).toBeNull();
  });
});

describe('isRouteSupported', () => {
  const bucharest = { lat: 44.4268, lon: 26.1025 };
  const cluj = { lat: 46.7712, lon: 23.6236 };
  const madrid = { lat: 40.4168, lon: -3.7038 };
  const barcelona = { lat: 41.3851, lon: 2.1734 };
  const berlin = { lat: 52.52, lon: 13.405 };
  const vienna = { lat: 48.2082, lon: 16.3738 };
  const bratislava = { lat: 48.1486, lon: 17.1077 };
  const london = { lat: 51.5074, lon: -0.1278 };

  it('supports a same-country RO ride', () => {
    expect(isRouteSupported(bucharest, cluj)).toEqual({ supported: true, country: 'RO' });
  });

  it('supports a same-country ES ride', () => {
    expect(isRouteSupported(madrid, barcelona)).toEqual({ supported: true, country: 'ES' });
  });

  it('supports a same-country ride in a newly covered country', () => {
    expect(isRouteSupported(berlin, berlin)).toEqual({ supported: true, country: 'DE' });
  });

  it('supports cross-border pairs — the whole region is one OSRM graph', () => {
    expect(isRouteSupported(vienna, bratislava)).toEqual({ supported: true, country: 'AT' });
    expect(isRouteSupported(bucharest, madrid)).toEqual({ supported: true, country: 'RO' });
  });

  it('rejects when origin is in an unsupported country', () => {
    expect(isRouteSupported(london, madrid)).toEqual({
      supported: false,
      originCountry: null,
      destinationCountry: 'ES',
      reason: 'origin_unsupported',
    });
  });

  it('rejects when destination is in an unsupported country', () => {
    expect(isRouteSupported(bucharest, london)).toEqual({
      supported: false,
      originCountry: 'RO',
      destinationCountry: null,
      reason: 'destination_unsupported',
    });
  });

  it('rejects when both endpoints are unsupported', () => {
    expect(isRouteSupported(london, london)).toEqual({
      supported: false,
      originCountry: null,
      destinationCountry: null,
      reason: 'origin_unsupported',
    });
  });
});
