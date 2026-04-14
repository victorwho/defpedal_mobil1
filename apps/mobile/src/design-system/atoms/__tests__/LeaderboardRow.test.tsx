// @vitest-environment happy-dom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("../../hooks/useHaptics", () => ({
  useHaptics: () => ({ light: vi.fn(), medium: vi.fn(), heavy: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
vi.mock("../../ThemeContext", () => ({
  useTheme: () => ({
    mode: "dark" as const,
    colors: {
      accent: "#FACC15", accentHover: "#EAB308", textPrimary: "#FFFFFF", textSecondary: "#9CA3AF",
      textMuted: "#8B9198", textInverse: "#111827", bgPrimary: "#1F2937", bgSecondary: "#374151",
      bgTertiary: "#4B5563", borderDefault: "rgba(255,255,255,0.08)", danger: "#EF4444",
      bgDeep: "#111827", info: "#3B82F6", safe: "#22C55E",
    },
  }),
}));
vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name, testID }: { name: string; testID?: string }) =>
    React.createElement("span", { "data-icon": name, "data-testid": testID ?? name }, name),
}));
vi.mock("../FadeSlideIn", () => ({
  FadeSlideIn: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock("../TierPill", () => ({
  TierPill: ({ tier }: { tier: string }) => React.createElement("span", { "data-testid": "tier-pill" }, tier),
}));

const { LeaderboardRow } = await import("../LeaderboardRow");

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  rank: 1,
  userId: "u1",
  displayName: "Alice B",
  avatarUrl: null,
  riderTier: "kickstand",
  metricValue: 12.5,
  rankDelta: null,
  isChampion: false,
  isRequestingUser: false,
  ...overrides,
});

describe("LeaderboardRow", () => {
  it("renders rank number and display name", () => {
    render(React.createElement(LeaderboardRow, { entry: makeEntry() as any, metric: "co2", isHighlighted: false, index: 0 }));
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("Alice B")).toBeTruthy();
  });

  it("shows NEW badge when rankDelta is null", () => {
    render(React.createElement(LeaderboardRow, { entry: makeEntry({ rankDelta: null }) as any, metric: "co2", isHighlighted: false, index: 0 }));
    expect(screen.getByText("NEW")).toBeTruthy();
  });

  it("shows up-arrow when rankDelta is positive", () => {
    render(React.createElement(LeaderboardRow, { entry: makeEntry({ rankDelta: 3 }) as any, metric: "co2", isHighlighted: false, index: 0 }));
    const icon = screen.getByText("arrow-up");
    expect(icon).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("shows down-arrow when rankDelta is negative", () => {
    render(React.createElement(LeaderboardRow, { entry: makeEntry({ rankDelta: -2 }) as any, metric: "co2", isHighlighted: false, index: 0 }));
    const icon = screen.getByText("arrow-down");
    expect(icon).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("renders champion trophy icon when isChampion is true", () => {
    render(React.createElement(LeaderboardRow, { entry: makeEntry({ isChampion: true }) as any, metric: "co2", isHighlighted: false, index: 0 }));
    expect(screen.getByText("trophy")).toBeTruthy();
  });

  it("does not render trophy when isChampion is false", () => {
    render(React.createElement(LeaderboardRow, { entry: makeEntry({ isChampion: false }) as any, metric: "co2", isHighlighted: false, index: 0 }));
    expect(screen.queryByText("trophy")).toBeNull();
  });
});