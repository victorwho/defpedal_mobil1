import { describe, expect, it } from 'vitest';

import { buildRequestTelemetry } from './telemetry';

describe('buildRequestTelemetry', () => {
  it('returns structured telemetry for tracked routes', () => {
    expect(buildRequestTelemetry('/v1/routes/preview', 200, 123.8)).toEqual({
      event: 'mobile_api_request',
      operation: 'route_preview',
      path: '/v1/routes/preview',
      statusCode: 200,
      durationMs: 124,
      outcome: 'success',
    });
  });

  it('normalizes query strings and error outcomes', () => {
    expect(buildRequestTelemetry('/v1/search/autocomplete?query=piata', 502, 45)).toEqual({
      event: 'mobile_api_request',
      operation: 'search_autocomplete',
      path: '/v1/search/autocomplete',
      statusCode: 502,
      durationMs: 45,
      outcome: 'server_error',
    });
  });

  it('skips untracked routes', () => {
    expect(buildRequestTelemetry('/health', 200, 5)).toBeNull();
  });
});
