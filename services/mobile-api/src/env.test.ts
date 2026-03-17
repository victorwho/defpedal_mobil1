// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseEnvFileContents, resolveEnvValue } from './env';

describe('parseEnvFileContents', () => {
  it('parses dotenv-style key-value pairs and ignores comments', () => {
    expect(
      parseEnvFileContents(`
        # comment
        VITE_MAPBOX_ACCESS_TOKEN="pk.test-token"
        export MAPBOX_ACCESS_TOKEN=pk.server-token
        EMPTY=
      `),
    ).toEqual({
      VITE_MAPBOX_ACCESS_TOKEN: 'pk.test-token',
      MAPBOX_ACCESS_TOKEN: 'pk.server-token',
      EMPTY: '',
    });
  });
});

describe('resolveEnvValue', () => {
  it('prefers earlier sources and falls back across multiple key names', () => {
    expect(
      resolveEnvValue(
        ['MAPBOX_ACCESS_TOKEN', 'VITE_MAPBOX_ACCESS_TOKEN'],
        [
          {
            MAPBOX_ACCESS_TOKEN: '',
          },
          {
            VITE_MAPBOX_ACCESS_TOKEN: 'pk.root-token',
          },
        ],
      ),
    ).toBe('pk.root-token');
  });

  it('ignores placeholder values when requested', () => {
    expect(
      resolveEnvValue(
        ['MAPBOX_ACCESS_TOKEN', 'VITE_MAPBOX_ACCESS_TOKEN'],
        [
          {
            MAPBOX_ACCESS_TOKEN: 'YOUR_MAPBOX_TOKEN_HERE',
          },
          {
            VITE_MAPBOX_ACCESS_TOKEN: 'pk.real-token',
          },
        ],
        '',
        {
          ignoreValues: ['YOUR_MAPBOX_TOKEN_HERE'],
        },
      ),
    ).toBe('pk.real-token');
  });
});
