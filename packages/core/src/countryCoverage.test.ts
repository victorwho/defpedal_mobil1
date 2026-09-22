import { describe, expect, it } from 'vitest';

import { SUPPORTED_APP_COUNTRIES } from './appAvailability';
import {
  HEAT_ROUTING_COUNTRIES,
  RISK_DATA_COUNTRIES,
  ROUTING_COVERED_COUNTRIES,
  isHeatRoutingAvailable,
  isRiskDataAvailable,
  getCountryCenter,
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

describe('isRiskDataAvailable', () => {
  it('road_risk_data covers the full routing footprint (b36v1, 2026-08-01)', () => {
    expect(RISK_DATA_COUNTRIES).toEqual(ROUTING_COVERED_COUNTRIES);
    expect(isRiskDataAvailable('RO')).toBe(true);
    expect(isRiskDataAvailable('ES')).toBe(true);
    expect(isRiskDataAvailable('DE')).toBe(true);
    // b47v1 risk export (2026-09-21) — UK street scores went live with routing.
    expect(isRiskDataAvailable('GB')).toBe(true);
    expect(isRiskDataAvailable(null)).toBe(false);
    expect(isRiskDataAvailable(undefined)).toBe(false);
  });

  it('risk-data countries are a subset of routing coverage', () => {
    for (const country of RISK_DATA_COUNTRIES) {
      expect(ROUTING_COVERED_COUNTRIES).toContain(country);
    }
  });

  it('RO and ES stay FIRST in the bbox iteration order', () => {
    // First-match attribution. Load-bearing while risk data was RO/ES-only
    // (overlap losses silently killed the risk overlay + comparison there);
    // cosmetic since risk data went EU-wide (2026-08-01), but kept locked so
    // any future re-narrowing of RISK_DATA_COUNTRIES doesn't reopen the trap.
    expect(ROUTING_COVERED_COUNTRIES.slice(0, 2)).toEqual(['RO', 'ES']);
  });
});

describe('isHeatRoutingAvailable', () => {
  it('heat-routing countries are a subset of routing coverage', () => {
    // Cool is a refinement of Safe — offering it outside the safe graph
    // would break the safe-degrade fallback in the dispatchers.
    for (const country of HEAT_ROUTING_COUNTRIES) {
      expect(ROUTING_COVERED_COUNTRIES).toContain(country);
    }
  });

  // Measured 2026-09-17: osrm-shade returned a real route from the capital of
  // every one of the 31 covered countries. Cool is no longer RO-only. The UK
  // joined with the b47v1 shade arm (2026-09-22).
  it('covers the whole routing footprint, not just Romania', () => {
    expect([...HEAT_ROUTING_COUNTRIES].sort()).toEqual([...ROUTING_COVERED_COUNTRIES].sort());
    for (const country of ROUTING_COVERED_COUNTRIES) {
      expect(isHeatRoutingAvailable(country)).toBe(true);
    }
  });

  it('is available well outside Romania', () => {
    expect(isHeatRoutingAvailable('RO')).toBe(true);
    expect(isHeatRoutingAvailable('DE')).toBe(true);
    expect(isHeatRoutingAvailable('ES')).toBe(true);
    expect(isHeatRoutingAvailable('GB')).toBe(true);
  });

  it('is unavailable for null/undefined attribution', () => {
    expect(isHeatRoutingAvailable(null)).toBe(false);
    expect(isHeatRoutingAvailable(undefined)).toBe(false);
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

  it('returns null for the Faroe Islands (north of the Shetland box, no graph data)', () => {
    expect(resolveCountryFromCoord({ lat: 62.0107, lon: -6.7741 })).toBeNull(); // Tórshavn
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

describe('resolveCountryFromCoord — United Kingdom (b47v1, 2026-09-21)', () => {
  it('resolves British cities to GB, islands included', () => {
    const cities: readonly [string, number, number][] = [
      ['London', 51.5074, -0.1278],
      ['Manchester', 53.4808, -2.2426],
      ['Cardiff', 51.4816, -3.1791],
      ['Edinburgh', 55.9533, -3.1883],
      ['Glasgow', 55.8642, -4.2518],
      ['Inverness', 57.4778, -4.2247],
      ['Lerwick (Shetland)', 60.155, -1.145],
      ['Kirkwall (Orkney)', 58.9809, -2.9605],
      ['Stornoway (Lewis)', 58.209, -6.387],
      ['Bowmore (Islay)', 55.7568, -6.2893],
      ['Campbeltown (Kintyre)', 55.4254, -5.6053],
      ['St Davids', 51.8812, -5.2656],
      ['Holyhead (Anglesey)', 53.3094, -4.6331],
      ['Norwich', 52.6309, 1.2974],
      ['Lowestoft', 52.4811, 1.7534],
      ['Belfast', 54.5973, -5.9301],
      ['Bangor (County Down)', 54.6538, -5.6682],
    ];
    for (const [name, lat, lon] of cities) {
      expect(resolveCountryFromCoord({ lat, lon }), name).toBe('GB');
    }
  });

  it('wins the English south coast back from the loose FR box', () => {
    // The FR box reaches 51.2°N. Before GB was listed ahead of it, every one
    // of these attributed as France.
    const southCoast: readonly [string, number, number][] = [
      ['Dover', 51.1279, 1.3134],
      ['Folkestone', 51.0814, 1.1695],
      ['Dungeness', 50.9135, 0.9767],
      ['Brighton', 50.8225, -0.1372],
      ['Southampton', 50.9097, -1.4044],
      ['Newport (Isle of Wight)', 50.7008, -1.2926],
      ['Exeter', 50.7184, -3.5339],
      ['Start Point', 50.2222, -3.6417],
      ['Plymouth', 50.3755, -4.1427],
      ['Penzance', 50.1188, -5.5371],
      ['Lizard Point', 49.9594, -5.2064],
      ['Hugh Town (Scilly)', 49.9146, -6.3131],
    ];
    for (const [name, lat, lon] of southCoast) {
      expect(resolveCountryFromCoord({ lat, lon }), name).toBe('GB');
    }
  });

  it('does not steal French land on the other side of the Channel', () => {
    const northFrance: readonly [string, number, number][] = [
      ['Calais', 50.9513, 1.8587],
      ['Sangatte', 50.9453, 1.7532],
      ['Cap Gris-Nez', 50.8697, 1.5836],
      ['Boulogne-sur-Mer', 50.7264, 1.6147],
      ['Le Tréport', 50.0599, 1.3708],
      ['Dieppe', 49.9229, 1.0775],
      ['Saint-Valery-en-Caux', 49.8686, 0.7113],
      ['Cherbourg', 49.6337, -1.6222],
      ['Dunkirk', 51.0344, 2.3768],
    ];
    for (const [name, lat, lon] of northFrance) {
      expect(resolveCountryFromCoord({ lat, lon }), name).toBe('FR');
    }
  });

  it('does not steal the Republic of Ireland', () => {
    const republic: readonly [string, number, number][] = [
      ['Dublin', 53.3498, -6.2603],
      ['Howth', 53.3867, -6.0653],
      ['Wicklow', 52.9808, -6.0446],
      ['Dundalk', 54.0, -6.4167],
      ['Carlingford', 54.0405, -6.1869],
      ['Letterkenny', 54.9558, -7.7342],
      ['Malin Head', 55.3814, -7.3739],
    ];
    for (const [name, lat, lon] of republic) {
      expect(resolveCountryFromCoord({ lat, lon }), name).toBe('IE');
    }
  });

  it('covers the rest of Northern Ireland through the IE box (cosmetic attribution)', () => {
    // West of the Belfast box the IE box claims Northern Ireland. Same graph,
    // same left-hand traffic — what matters is that the point is covered.
    expect(resolveCountryFromCoord({ lat: 54.9966, lon: -7.3086 })).toBe('IE'); // Derry
    expect(resolveCountryFromCoord({ lat: 54.1751, lon: -6.3402 })).toBe('IE'); // Newry
    expect(resolveCountryFromCoord({ lat: 54.3438, lon: -7.6315 })).toBe('IE'); // Enniskillen
  });

  it('leaves the Channel Islands with their existing FR attribution', () => {
    // Crown Dependencies, not in the graph (probed: 29 km snap, distance-0) —
    // outside every GB box, unchanged by the UK launch.
    expect(resolveCountryFromCoord({ lat: 49.186, lon: -2.106 })).toBe('FR'); // St Helier
    expect(resolveCountryFromCoord({ lat: 49.456, lon: -2.536 })).toBe('FR'); // St Peter Port
  });

  it('centres the camera default on England, not the North Sea', () => {
    const center = getCountryCenter('GB');
    expect(center.lat).toBeGreaterThan(52);
    expect(center.lat).toBeLessThan(54.5);
    expect(center.lon).toBeGreaterThan(-3);
    expect(center.lon).toBeLessThan(-1);
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
  const edinburgh = { lat: 55.9533, lon: -3.1883 };
  const dublin = { lat: 53.3498, lon: -6.2603 };
  const belfast = { lat: 54.5973, lon: -5.9301 };
  const kyiv = { lat: 50.4501, lon: 30.5234 };

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

  it('supports UK rides, including across the Irish land border', () => {
    expect(isRouteSupported(london, edinburgh)).toEqual({ supported: true, country: 'GB' });
    expect(isRouteSupported(dublin, belfast)).toEqual({ supported: true, country: 'IE' });
  });

  it('rejects when origin is in an unsupported country', () => {
    expect(isRouteSupported(kyiv, madrid)).toEqual({
      supported: false,
      originCountry: null,
      destinationCountry: 'ES',
      reason: 'origin_unsupported',
    });
  });

  it('rejects when destination is in an unsupported country', () => {
    expect(isRouteSupported(bucharest, kyiv)).toEqual({
      supported: false,
      originCountry: 'RO',
      destinationCountry: null,
      reason: 'destination_unsupported',
    });
  });

  it('rejects when both endpoints are unsupported', () => {
    expect(isRouteSupported(kyiv, kyiv)).toEqual({
      supported: false,
      originCountry: null,
      destinationCountry: null,
      reason: 'origin_unsupported',
    });
  });
});
