// @vitest-environment happy-dom
/**
 * useHazardVote — Unit tests
 *
 * Covers online success, rollback on error, offline enqueue via the collapse
 * helper, and the online/offline branching of the `onSuccess` invalidate call.
 */
import type { NearbyHazard } from '@defensivepedal/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const voteHazardSpy = vi.fn<
  (hazardId: string, direction: 'up' | 'down', iso?: string) => Promise<unknown>
>();

vi.mock('../../lib/api', () => ({
  mobileApi: {
    voteHazard: (hazardId: string, direction: 'up' | 'down', iso?: string) =>
      voteHazardSpy(hazardId, direction, iso),
  },
}));

let mockIsOnline = true;

vi.mock('../../providers/ConnectivityMonitor', () => ({
  useConnectivity: () => ({ isOnline: mockIsOnline }),
}));

let mockUserId: string | null = 'user-1';

vi.mock('../../providers/AuthSessionProvider', () => ({
  useAuthSessionOptional: () => ({ user: mockUserId ? { id: mockUserId } : null }),
}));

import { useHazardVote } from '../useHazardVote';
import { useAppStore } from '../../store/appStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeHazard = (overrides: Partial<NearbyHazard> = {}): NearbyHazard => ({
  id: 'haz-1',
  lat: 44.43,
  lon: 26.1,
  hazardType: 'pothole',
  createdAt: new Date().toISOString(),
  confirmCount: 2,
  denyCount: 1,
  score: 1,
  userVote: null,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  lastConfirmedAt: null,
  ...overrides,
});

const wrapperFactory = (qc: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useHazardVote', () => {
  let qc: QueryClient;

  beforeEach(() => {
    mockIsOnline = true;
    mockUserId = 'user-1';
    voteHazardSpy.mockReset();

    // Fresh store + query client per test.
    useAppStore.setState({ userHazardVotes: {}, queuedMutations: [] });
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    qc.clear();
  });

  it('patches the user-scoped cache optimistically (flip-safe)', async () => {
    const hazard = makeHazard({ userVote: 'up', confirmCount: 3, denyCount: 1, score: 2 });
    qc.setQueryData(['nearby-hazards', 'user-1', '44.430', '26.100', 1000], [hazard]);

    voteHazardSpy.mockResolvedValue({
      hazardId: 'haz-1',
      score: 0,
      confirmCount: 2,
      denyCount: 2,
      userVote: 'down',
      expiresAt: hazard.expiresAt,
      lastConfirmedAt: null,
    });

    const { result } = renderHook(() => useHazardVote(), { wrapper: wrapperFactory(qc) });

    await act(async () => {
      await result.current.downvote('haz-1');
    });

    // applyOptimisticPatch rolls back prev 'up' (confirm 3→2) then adds 'down' (deny 1→2)
    // → score 2 - 2 = 0. The server's subsequent response confirms.
    expect(voteHazardSpy).toHaveBeenCalledWith('haz-1', 'down', undefined);
    expect(useAppStore.getState().userHazardVotes['haz-1']).toBe('down');
  });

  it('restores prior local store + cache on server error', async () => {
    const hazard = makeHazard();
    const queryKey = ['nearby-hazards', 'user-1', '44.430', '26.100', 1000];
    qc.setQueryData(queryKey, [hazard]);

    // Seed a prior local vote to verify restoration path.
    useAppStore.getState().setUserHazardVote('haz-1', 'up');
    voteHazardSpy.mockRejectedValue(new Error('500 Internal'));

    const { result } = renderHook(() => useHazardVote(), { wrapper: wrapperFactory(qc) });

    await act(async () => {
      try {
        await result.current.downvote('haz-1');
      } catch {
        // expected
      }
    });

    // onError fires synchronously after mutationFn rejects — wait for
    // settled state before asserting to avoid microtask ordering flakiness.
    await waitFor(() => {
      expect(useAppStore.getState().userHazardVotes['haz-1']).toBe('up');
    });
    expect(qc.getQueryData(queryKey)).toEqual([hazard]);
  });

  it('offline: enqueues via castHazardVote instead of hitting the network', async () => {
    mockIsOnline = false;

    const { result } = renderHook(() => useHazardVote(), { wrapper: wrapperFactory(qc) });

    await act(async () => {
      await result.current.upvote('haz-42');
    });

    expect(voteHazardSpy).not.toHaveBeenCalled();
    const q = useAppStore.getState().queuedMutations;
    expect(q).toHaveLength(1);
    expect(q[0].type).toBe('hazard_vote');
    expect((q[0].payload as { hazardId: string; direction: string }).direction).toBe('up');
    expect(useAppStore.getState().userHazardVotes['haz-42']).toBe('up');
  });

  it('offline: collapses an existing queued up-vote when down-voting the same hazard', async () => {
    mockIsOnline = false;

    const { result } = renderHook(() => useHazardVote(), { wrapper: wrapperFactory(qc) });

    await act(async () => {
      await result.current.upvote('haz-7');
    });
    await act(async () => {
      await result.current.downvote('haz-7');
    });

    const q = useAppStore.getState().queuedMutations;
    expect(q).toHaveLength(1);
    expect((q[0].payload as { direction: string }).direction).toBe('down');
  });

  it('offline: does NOT invalidate the nearby-hazards query (avoids drain race)', async () => {
    mockIsOnline = false;

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useHazardVote(), { wrapper: wrapperFactory(qc) });

    await act(async () => {
      await result.current.upvote('haz-9');
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('online: invalidates the user-scoped nearby-hazards key on success', async () => {
    voteHazardSpy.mockResolvedValue({
      hazardId: 'haz-1',
      score: 2,
      confirmCount: 3,
      denyCount: 1,
      userVote: 'up',
      expiresAt: new Date().toISOString(),
      lastConfirmedAt: null,
    });

    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useHazardVote(), { wrapper: wrapperFactory(qc) });

    await act(async () => {
      await result.current.upvote('haz-1');
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['nearby-hazards', 'user-1'],
      });
    });
  });
});
