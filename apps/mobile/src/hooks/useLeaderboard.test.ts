// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchLeaderboard = vi.fn();

vi.mock("../lib/api", () => ({
  mobileApi: {
    fetchLeaderboard: (...args: unknown[]) => mockFetchLeaderboard(...args),
  },
}));

const mockUseCurrentLocation = vi.fn();

vi.mock("./useCurrentLocation", () => ({
  useCurrentLocation: () => mockUseCurrentLocation(),
}));

import { useLeaderboard } from "./useLeaderboard";

let queryClient: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  mockUseCurrentLocation.mockReturnValue({
    location: { lat: 44.43, lon: 26.1 },
    permissionStatus: "granted",
    isLoading: false,
    error: null,
  });
});

afterEach(() => { queryClient.clear(); });

describe("useLeaderboard", () => {
  it("does not fetch when location is null", () => {
    mockUseCurrentLocation.mockReturnValue({ location: null, permissionStatus: "undetermined", isLoading: true, error: null });
    const { result } = renderHook(() => useLeaderboard("co2", "week"), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(mockFetchLeaderboard).not.toHaveBeenCalled();
  });

  it("returns empty state when location permission is denied", () => {
    mockUseCurrentLocation.mockReturnValue({ location: null, permissionStatus: "denied", isLoading: false, error: null });
    const { result } = renderHook(() => useLeaderboard("co2", "week"), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetchLeaderboard).not.toHaveBeenCalled();
  });

  it("fetches leaderboard data when location is available", async () => {
    const mockResponse = {
      entries: [{ rank: 1, userId: "u1", displayName: "Alice", avatarUrl: null, riderTier: "kickstand", metricValue: 12.5, rankDelta: null, isChampion: false, isRequestingUser: false }],
      userRank: null,
      periodStart: "2026-04-07T04:00:00.000Z",
      periodEnd: "2026-04-13T23:59:59.000Z",
    };
    mockFetchLeaderboard.mockResolvedValue(mockResponse);
    const { result } = renderHook(() => useLeaderboard("co2", "week"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(mockResponse);
    expect(result.current.error).toBeNull();
    expect(mockFetchLeaderboard).toHaveBeenCalledWith(44.43, 26.1, "co2", "week");
  });

  it("returns error string when fetch fails", async () => {
    mockFetchLeaderboard.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useLeaderboard("hazards", "month"), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("Network error");
  });

  it("passes correct metric and period to mobileApi", async () => {
    mockFetchLeaderboard.mockResolvedValue({ entries: [], userRank: null, periodStart: "2026-04-01T04:00:00.000Z", periodEnd: "2026-04-30T23:59:59.000Z" });
    const { result } = renderHook(() => useLeaderboard("hazards", "month"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFetchLeaderboard).toHaveBeenCalledWith(44.43, 26.1, "hazards", "month");
  });

  it("exposes a refetch function", async () => {
    mockFetchLeaderboard.mockResolvedValue({ entries: [], userRank: null, periodStart: "2026-04-07T04:00:00.000Z", periodEnd: "2026-04-13T23:59:59.000Z" });
    const { result } = renderHook(() => useLeaderboard("co2", "all"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(typeof result.current.refetch).toBe("function");
  });
});