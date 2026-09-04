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
  createCourseId,
  deleteCourseGeometry,
  pruneOrphanedCourses,
  readCourseGeometry,
  writeCourseGeometry,
} = await import('./courseStorage');

const DIR = 'file:///documents/imported-courses/';

const coordinates: [number, number][] = [
  [26.1025, 44.4268],
  [26.1125, 44.4368],
  [26.1225, 44.4468],
];

beforeEach(() => {
  files.clear();
  directories.clear();
});

describe('createCourseId', () => {
  it('produces filesystem-safe, unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCourseId()));

    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^course-[0-9a-z-]+$/);
      expect(id).not.toContain('/');
      expect(id).not.toContain('..');
    }
  });
});

describe('writeCourseGeometry / readCourseGeometry', () => {
  it('round-trips geometry', async () => {
    expect(await writeCourseGeometry('c1', { coordinates, elevations: undefined })).toBe(
      true,
    );

    const read = await readCourseGeometry('c1');
    expect(read?.coordinates).toEqual(coordinates);
    expect(read?.elevations).toBeUndefined();
  });

  it('round-trips elevations when present', async () => {
    await writeCourseGeometry('c1', { coordinates, elevations: [80, 85, 92] });

    expect((await readCourseGeometry('c1'))?.elevations).toEqual([80, 85, 92]);
  });

  it('writes into the document directory, not the cache', async () => {
    // The cache is evictable by the OS; a course vanishing between planning
    // and setting off is the failure this feature cannot have.
    await writeCourseGeometry('c1', { coordinates, elevations: undefined });

    expect([...files.keys()][0]).toBe(`${DIR}c1.json`);
  });

  it('creates the directory on first write', async () => {
    await writeCourseGeometry('c1', { coordinates, elevations: undefined });

    expect(directories.has(DIR)).toBe(true);
  });

  it('returns null for a course that was never written', async () => {
    expect(await readCourseGeometry('missing')).toBeNull();
  });

  it('refuses ids that would escape the directory', async () => {
    expect(
      await writeCourseGeometry('../escape', { coordinates, elevations: undefined }),
    ).toBe(false);
    expect(await readCourseGeometry('../escape')).toBeNull();
    expect(files.size).toBe(0);
  });
});

describe('readCourseGeometry — validation on read', () => {
  it('rejects a truncated file rather than returning half a route', async () => {
    files.set(`${DIR}c1.json`, '{"coordinates":[[26.1,44.4],');

    expect(await readCourseGeometry('c1')).toBeNull();
  });

  it('rejects geometry with fewer than two points', async () => {
    files.set(`${DIR}c1.json`, JSON.stringify({ coordinates: [[26.1, 44.4]] }));

    expect(await readCourseGeometry('c1')).toBeNull();
  });

  it('rejects non-finite coordinates', async () => {
    files.set(
      `${DIR}c1.json`,
      JSON.stringify({ coordinates: [[26.1, 44.4], [null, 44.5]] }),
    );

    expect(await readCourseGeometry('c1')).toBeNull();
  });

  it('rejects a partial elevation array', async () => {
    // Pairing 2 elevations with 3 points assigns them to the wrong
    // coordinates — the same 1:1 invariant the parser and exporter enforce.
    files.set(
      `${DIR}c1.json`,
      JSON.stringify({ coordinates, elevations: [80, 85] }),
    );

    expect(await readCourseGeometry('c1')).toBeNull();
  });
});

describe('deleteCourseGeometry', () => {
  it('removes the file', async () => {
    await writeCourseGeometry('c1', { coordinates, elevations: undefined });
    await deleteCourseGeometry('c1');

    expect(await readCourseGeometry('c1')).toBeNull();
  });

  it('is a no-op for a course that is not there', async () => {
    await expect(deleteCourseGeometry('missing')).resolves.toBeUndefined();
  });
});

describe('pruneOrphanedCourses', () => {
  it('removes files no metadata row points at', async () => {
    await writeCourseGeometry('keep', { coordinates, elevations: undefined });
    await writeCourseGeometry('orphan', { coordinates, elevations: undefined });

    expect(await pruneOrphanedCourses(['keep'])).toBe(1);
    expect(await readCourseGeometry('keep')).not.toBeNull();
    expect(await readCourseGeometry('orphan')).toBeNull();
  });

  it('keeps everything when every file is known', async () => {
    await writeCourseGeometry('a', { coordinates, elevations: undefined });
    await writeCourseGeometry('b', { coordinates, elevations: undefined });

    expect(await pruneOrphanedCourses(['a', 'b'])).toBe(0);
    expect(files.size).toBe(2);
  });

  it('reports nothing when the directory does not exist yet', async () => {
    expect(await pruneOrphanedCourses([])).toBe(0);
  });
});
