// @vitest-environment node
/**
 * Unit tests for submissions.ts — exercising the in-memory fallback path
 * (no Supabase).  The supabaseAdmin module is mocked to return null so every
 * submission branches to the memory store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin as null BEFORE importing the module under test so the
// in-memory branch is always exercised.
vi.mock('../lib/supabaseAdmin', () => ({ supabaseAdmin: null }));

import {
  submitHazardReport,
  startTripRecord,
  finishTripRecord,
  saveTripTrack,
  getTripHistory,
  submitNavigationFeedback,
} from '../lib/submissions';

// ---------------------------------------------------------------------------
// submitHazardReport (memory path)
// ---------------------------------------------------------------------------

describe('submitHazardReport (memory fallback)', () => {
  it('returns a reportId and acceptedAt for a minimal request', async () => {
    const result = await submitHazardReport(
      {
        coordinate: { lat: 44.4, lon: 26.1 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
      },
      null,
    );

    expect(result.reportId).toBeTruthy();
    expect(result.reportId).toMatch(/^hazard-/);
    expect(result.acceptedAt).toBeTruthy();
  });

  it('returns a reportId when hazardType is provided', async () => {
    const result = await submitHazardReport(
      {
        coordinate: { lat: 44.4, lon: 26.1 },
        reportedAt: new Date().toISOString(),
        source: 'manual',
        hazardType: 'pothole',
      },
      'user-123',
    );

    expect(result.reportId).toMatch(/^hazard-/);
  });

  it('generates unique IDs for different submissions', async () => {
    const req = {
      coordinate: { lat: 44.4, lon: 26.1 },
      reportedAt: new Date().toISOString(),
      source: 'manual' as const,
    };

    const [r1, r2] = await Promise.all([
      submitHazardReport(req, null),
      submitHazardReport(req, null),
    ]);

    expect(r1.reportId).not.toBe(r2.reportId);
  });
});

// ---------------------------------------------------------------------------
// startTripRecord (memory path)
// ---------------------------------------------------------------------------

describe('startTripRecord (memory fallback)', () => {
  it('returns a tripId and echoes back the clientTripId', async () => {
    const result = await startTripRecord(
      {
        clientTripId: 'client-001',
        sessionId: 'session-001',
        startLocationText: 'Home',
        startCoordinate: { lat: 44.4, lon: 26.1 },
        destinationText: 'Office',
        destinationCoordinate: { lat: 44.5, lon: 26.2 },
        distanceMeters: 5000,
        startedAt: new Date().toISOString(),
      },
      'user-001',
    );

    expect(result.clientTripId).toBe('client-001');
    expect(result.tripId).toMatch(/^trip-/);
    expect(result.acceptedAt).toBeTruthy();
  });

  it('generates distinct tripIds for concurrent trips', async () => {
    const makeReq = (id: string) => ({
      clientTripId: id,
      sessionId: `session-${id}`,
      startLocationText: 'A',
      startCoordinate: { lat: 0, lon: 0 },
      destinationText: 'B',
      destinationCoordinate: { lat: 1, lon: 1 },
      distanceMeters: 100,
      startedAt: new Date().toISOString(),
    });

    const [r1, r2] = await Promise.all([
      startTripRecord(makeReq('c1'), 'u1'),
      startTripRecord(makeReq('c2'), 'u1'),
    ]);

    expect(r1.tripId).not.toBe(r2.tripId);
  });
});

// ---------------------------------------------------------------------------
// finishTripRecord (memory path)
// ---------------------------------------------------------------------------

describe('finishTripRecord (memory fallback)', () => {
  it('returns echoed clientTripId and tripId', async () => {
    const result = await finishTripRecord(
      {
        clientTripId: 'client-001',
        tripId: 'trip-xyz',
        endedAt: new Date().toISOString(),
        reason: 'completed',
      },
      'user-001',
    );

    expect(result.clientTripId).toBe('client-001');
    expect(result.tripId).toBe('trip-xyz');
    expect(result.acceptedAt).toBeTruthy();
  });

  it('accepts "stopped" as a valid reason', async () => {
    const result = await finishTripRecord(
      {
        clientTripId: 'client-002',
        tripId: 'trip-abc',
        endedAt: new Date().toISOString(),
        reason: 'stopped',
      },
      'user-001',
    );

    expect(result.tripId).toBe('trip-abc');
  });
});

// ---------------------------------------------------------------------------
// saveTripTrack (memory path)
// ---------------------------------------------------------------------------

describe('saveTripTrack (memory fallback)', () => {
  it('returns acceptedAt without errors', async () => {
    const result = await saveTripTrack(
      {
        tripId: 'trip-xyz',
        clientTripId: 'client-001',
        routingMode: 'safe',
        gpsBreadcrumbs: [
          { lat: 44.4, lon: 26.1, ts: Date.now(), acc: 5, spd: null, hdg: null },
          { lat: 44.41, lon: 26.11, ts: Date.now() + 5000, acc: 8, spd: 4.2, hdg: 90 },
        ],
        endReason: 'completed',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
      'user-001',
    );

    expect(result.acceptedAt).toBeTruthy();
  });

  it('handles optional polyline fields being undefined', async () => {
    const result = await saveTripTrack(
      {
        tripId: 'trip-xyz',
        clientTripId: 'client-002',
        routingMode: 'fast',
        gpsBreadcrumbs: [],
        endReason: 'app_killed',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        plannedRoutePolyline6: undefined,
        plannedRouteDistanceMeters: undefined,
      },
      'user-001',
    );

    expect(result.acceptedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// getTripHistory (memory path — supabaseAdmin is null)
// ---------------------------------------------------------------------------

describe('getTripHistory (memory fallback)', () => {
  it('returns an empty array when supabase is not available', async () => {
    const result = await getTripHistory('user-001');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// submitNavigationFeedback (memory path)
// ---------------------------------------------------------------------------

describe('submitNavigationFeedback (memory fallback)', () => {
  it('returns acceptedAt for a valid feedback request', async () => {
    const result = await submitNavigationFeedback(
      {
        sessionId: 'session-001',
        startLocationText: 'Home',
        destinationText: 'Office',
        distanceMeters: 5000,
        durationSeconds: 1200,
        rating: 4,
        feedbackText: 'Great route, well-lit streets.',
        submittedAt: new Date().toISOString(),
      },
      'user-001',
    );

    expect(result.acceptedAt).toBeTruthy();
  });

  it('handles minimum valid rating (1)', async () => {
    const result = await submitNavigationFeedback(
      {
        sessionId: 'session-002',
        startLocationText: 'A',
        destinationText: 'B',
        distanceMeters: 100,
        durationSeconds: 60,
        rating: 1,
        feedbackText: '',
        submittedAt: new Date().toISOString(),
      },
      'user-001',
    );

    expect(result.acceptedAt).toBeTruthy();
  });

  it('handles maximum valid rating (5)', async () => {
    const result = await submitNavigationFeedback(
      {
        sessionId: 'session-003',
        startLocationText: 'A',
        destinationText: 'B',
        distanceMeters: 100,
        durationSeconds: 60,
        rating: 5,
        feedbackText: 'Perfect!',
        submittedAt: new Date().toISOString(),
      },
      'user-001',
    );

    expect(result.acceptedAt).toBeTruthy();
  });
});
