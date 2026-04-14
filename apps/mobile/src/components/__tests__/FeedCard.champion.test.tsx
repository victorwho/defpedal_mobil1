// @vitest-environment happy-dom
/**
 * FeedCard champion trophy tests.
 * Verifies the trophy icon renders when isWeeklyChampion is true.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../design-system", () => ({
  useTheme: () => ({
    mode: "dark" as const,
    colors: {
      accent: "#FACC15", textPrimary: "#FFFFFF", textSecondary: "#9CA3AF",
      textMuted: "#8B9198", textInverse: "#111827", bgPrimary: "#1F2937",
      bgSecondary: "#374151", bgTertiary: "#4B5563", borderDefault: "rgba(255,255,255,0.08)",
      danger: "#EF4444", bgDeep: "#111827", safe: "#22C55E", caution: "#F59E0B",
    },
  }),
}));
vi.mock("../../design-system/atoms/TierPill", () => ({ TierPill: () => null }));
vi.mock("./LikeButton", () => ({ ReactionBar: () => null }));
vi.mock("./map", () => ({
  RouteMap: () => React.createElement("div", { "data-testid": "route-map" }),
}));
vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name, testID }: { name: string; testID?: string }) =>
    React.createElement("span", { "data-icon": name, "data-testid": testID ?? name }, name),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));

const { FeedCard } = await import("../FeedCard");

const makeFeedItem = (overrides: Record<string, unknown> = {}) => ({
  id: "trip-1",
  user: { id: "u1", displayName: "Alice", username: null, avatarUrl: null, riderTier: "kickstand" },
  title: "Morning ride",
  startLocationText: "Home",
  destinationText: "Office",
  distanceMeters: 5000,
  durationSeconds: 1200,
  elevationGainMeters: 50,
  averageSpeedMps: 4.2,
  safetyRating: 8,
  safetyTags: [],
  geometryPolyline6: "encoded",
  note: null,
  sharedAt: "2026-04-01T08:00:00Z",
  likeCount: 3,
  loveCount: 1,
  lovedByMe: false,
  likedByMe: false,
  co2SavedKg: 0.6,
  commentCount: 0,
  isWeeklyChampion: false,
  championMetric: null,
  ...overrides,
});

const noop = () => {};

describe("FeedCard champion trophy", () => {
  it("renders trophy icon when isWeeklyChampion is true", () => {
    render(React.createElement(FeedCard, {
      item: makeFeedItem({ isWeeklyChampion: true }) as any,
      isVisible: false,
      onLike: noop,
      onLove: noop,
      onPress: noop,
    }));
    expect(screen.getByText("trophy")).toBeTruthy();
  });

  it("does not render trophy icon when isWeeklyChampion is false", () => {
    render(React.createElement(FeedCard, {
      item: makeFeedItem({ isWeeklyChampion: false }) as any,
      isVisible: false,
      onLike: noop,
      onLove: noop,
      onPress: noop,
    }));
    expect(screen.queryByText("trophy")).toBeNull();
  });

  it("does not render trophy icon when isWeeklyChampion is undefined", () => {
    const item = makeFeedItem();
    delete (item as Record<string, unknown>)["isWeeklyChampion"];
    render(React.createElement(FeedCard, {
      item: item as any,
      isVisible: false,
      onLike: noop,
      onLove: noop,
      onPress: noop,
    }));
    expect(screen.queryByText("trophy")).toBeNull();
  });
});