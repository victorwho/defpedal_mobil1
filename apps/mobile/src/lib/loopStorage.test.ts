import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for expo-file-system. Exercises the real control flow
// (directory creation, JSON round-trip, validation on read, orphan sweep)
// without a native module.
const files = new Map<string, string>();
const directories = new Set<string>();

vi.mock('expo-file-system/legacy', () => ({
  get documentDirectory() {
    return 'file:///documents/';
  },
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: directories.has(uri) || files.has(uri),
  })),
  makeDirectoryAsync: vi.fn(async (uri: string) => {
    directories.add(uri);
  }),
  writeAsStringAsync: vi.fn(async (uri: string, contents: string) => {
    files.set(uri, contents);
  }),
  readAsStringAsync: vi.fn(async (uri: string) => {
    const contents = files.get(uri);
    if (contents === undefined) throw new Error('ENOENT');
    return contents;
  }),
  deleteAsync: vi.fn(async (uri: string) => {
    files.delete(uri);
  }),
  readDirectoryAsync: vi.fn(async (uri: string) =>
    [...files.keys()]
      .filter((key) => key.startsWith(uri))
      .map((key) => key.slice(uri.length)),
  ),
}));

const {
  createSavedLoopId,
  deleteSavedLoop,
  pruneOrphanedLoops,
  readSavedLoop,
  writeSavedLoop,
} = await import('./loopStorage');

const route = {
  id: 'loop-1',
  source: 'generated_loop',
  routingEngineVersion: 'v1',
  routingProfileVersion: 'safety-profile-v1',
  mapDataVersion: 'v1',
  riskModelVersion: 'v1',
  geometryPolyline6: 'abc123',
  distanceMeters: 24_000,
  durationSeconds: 5_400,
  adjustedDurationSeconds: 5_400,
  totalClimbMeters: 320,
  steps: [],
  riskSegments: [],
  routeFeatures: [],
  warnings: [],
} as never;

const start = { lat: 45.59, lon: 25.46 };

beforeEach(() => {
  files.clear();
  directories.clear();
});

describe('saved loop storage', () => {
  it('round-trips a loop', async () => {
    expect(await writeSavedLoop('a', { route, start })).toBe(true);
    const back = await readSavedLoop('a');
    expect(back?.route.geometryPolyline6).toBe('abc123');
    expect(back?.route.distanceMeters).toBe(24_000);
    expect(back?.start).toEqual(start);
  });

  it('keeps the steps, so a saved loop needs no re-fetch to ride', async () => {
    // A course synthesizes instructions from bare geometry because a GPX has
    // none. A loop came from OSRM with steps; storing the whole RouteOption is
    // what lets it open offline and identical.
    const withSteps = {
      ...(route as object),
      steps: [{ id: 's1', instruction: 'Head north' }],
    } as never;
    await writeSavedLoop('b', { route: withSteps, start });
    const back = await readSavedLoop('b');
    expect(back?.route.steps).toHaveLength(1);
  });

  it('refuses a loop that lost its generated_loop marker', async () => {
    // That marker is what suppresses auto-reroute. Riding a loop without it
    // means navigation silently routes the rider home mid-ride — better to
    // fail to open than to open one unprotected.
    const stripped = { ...(route as object), source: 'custom_osrm' } as never;
    files.set(
      'file:///documents/saved-loops/c.json',
      JSON.stringify({ route: stripped, start }),
    );
    expect(await readSavedLoop('c')).toBeNull();
  });

  it('refuses a truncated or malformed file rather than riding it', async () => {
    files.set('file:///documents/saved-loops/d.json', '{"route":{"dist');
    expect(await readSavedLoop('d')).toBeNull();

    files.set(
      'file:///documents/saved-loops/e.json',
      JSON.stringify({ route: { ...(route as object), geometryPolyline6: '' }, start }),
    );
    expect(await readSavedLoop('e')).toBeNull();

    files.set(
      'file:///documents/saved-loops/f.json',
      JSON.stringify({ route, start: { lat: 'north', lon: 25 } }),
    );
    expect(await readSavedLoop('f')).toBeNull();
  });

  it('returns null for a loop that is not there', async () => {
    expect(await readSavedLoop('missing')).toBeNull();
  });

  it('refuses an id that would escape the directory', async () => {
    expect(await writeSavedLoop('../escape', { route, start })).toBe(false);
    expect(await readSavedLoop('../escape')).toBeNull();
  });

  it('deletes, and treats a missing file as already gone', async () => {
    await writeSavedLoop('a', { route, start });
    await deleteSavedLoop('a');
    expect(await readSavedLoop('a')).toBeNull();
    await expect(deleteSavedLoop('a')).resolves.toBeUndefined();
  });

  it('sweeps files no metadata row points at', async () => {
    await writeSavedLoop('keep', { route, start });
    await writeSavedLoop('orphan', { route, start });
    expect(await pruneOrphanedLoops(['keep'])).toBe(1);
    expect(await readSavedLoop('keep')).not.toBeNull();
    expect(await readSavedLoop('orphan')).toBeNull();
  });

  it('mints ids that do not collide', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createSavedLoopId()));
    expect(ids.size).toBe(50);
  });
});
