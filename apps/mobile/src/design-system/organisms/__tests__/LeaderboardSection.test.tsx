// @vitest-environment happy-dom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseLeaderboard = vi.fn();

vi.mock("../../hooks/useLeaderboard", () => ({
  useLeaderboard: (...args: unknown[]) => mockUseLeaderboard(...args),
}));

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
  Ionicons: ({ name }: { name: string }) => React.createElement("span", { "data-icon": name }, name),
}));
vi.mock("../atoms/FadeSlideIn", () => ({
  FadeSlideIn: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
vi.mock("../atoms/TierPill", () => ({
  TierPill: ({ tier }: { tier: string }) => React.createElement("span", null, tier),
}));
vi.mock("../atoms/LeaderboardRow", () => ({
  LeaderboardRow: ({ entry }: { entry: { displayName: string } }) => React.createElement("div", { "data-testid": "leaderboard-row" }, entry.displayName),
}));
vi.mock("../atoms/SectionTitle", () => ({
  SectionTitle: ({ children }: { children: React.ReactNode }) => React.createElement("h2", null, children),
}));
vi.mock("../atoms/Button", () => ({
  Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => React.createElement("button", { onClick: onPress }, children),
}));

const { LeaderboardSection } = await import("../LeaderboardSection");

const makeEntry = (rank: number, userId: string) => ({
  rank, userId, displayName: "Rider " + rank, avatarUrl: null, riderTier: "kickstand",
  metricValue: 10 * rank, rankDelta: null, isChampion: false, isRequestingUser: false,
});

beforeEach(() => {
  mockUseLeaderboard.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
});

describe("LeaderboardSection", () => {
  it("shows loading indicator when isLoading is true", () => {
    mockUseLeaderboard.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    render(React.createElement(LeaderboardSection, null));
    expect(screen.getByText("Neighborhood Leaderboard")).toBeTruthy();
  });

  it("shows error message and retry button on error", () => {
    const refetch = vi.fn();
    mockUseLeaderboard.mockReturnValue({ data: undefined, isLoading: false, error: "Network error", refetch });
    render(React.createElement(LeaderboardSection, null));
    expect(screen.getByText("Network error")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("shows empty state when entries is empty", () => {
    mockUseLeaderboard.mockReturnValue({
      data: { entries: [], userRank: null, periodStart: "2026-04-07T04:00:00.000Z", periodEnd: "2026-04-13T23:59:59.000Z" },
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(React.createElement(LeaderboardSection, null));
    expect(screen.getByText("No activity in your area yet")).toBeTruthy();
  });

  it("renders a row for each entry", () => {
    mockUseLeaderboard.mockReturnValue({
      data: { entries: [makeEntry(1, "u1"), makeEntry(2, "u2"), makeEntry(3, "u3")], userRank: null, periodStart: "2026-04-07T04:00:00.000Z", periodEnd: "2026-04-13T23:59:59.000Z" },
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(React.createElement(LeaderboardSection, null));
    const rows = screen.getAllByTestId("leaderboard-row");
    expect(rows).toHaveLength(3);
  });

  it("calls refetch when Retry button is clicked", () => {
    const refetch = vi.fn();
    mockUseLeaderboard.mockReturnValue({ data: undefined, isLoading: false, error: "timeout", refetch });
    render(React.createElement(LeaderboardSection, null));
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});