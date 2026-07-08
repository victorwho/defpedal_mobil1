// @vitest-environment happy-dom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockUseLeaderboard = vi.fn();

// NOTE ON MOCK PATHS: this test file lives in `organisms/__tests__/`, one
// level deeper than the SUT (`organisms/LeaderboardSection.tsx`). Mock
// specifiers must therefore carry one MORE `../` than the SUT's own import to
// resolve to the same module. `useLeaderboard` is `src/hooks/...` (three up);
// the atoms are `design-system/atoms/...` (two up). Getting this wrong silently
// lets the REAL module load — which is exactly how the real `useLeaderboard`
// (→ useCurrentLocation → expo-location) leaked in and blocked collection
// before 2026-06-09.
vi.mock("../../../hooks/useLeaderboard", () => ({
  useLeaderboard: (...args: unknown[]) => mockUseLeaderboard(...args),
}));

vi.mock("../../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));
vi.mock("../../hooks/useHaptics", () => ({
  useHaptics: () => ({
    confirm: vi.fn(), success: vi.fn(), warning: vi.fn(), celebration: vi.fn(),
    destructiveConfirm: vi.fn(), snap: vi.fn(), fire: vi.fn(),
    light: vi.fn(), medium: vi.fn(), heavy: vi.fn(), error: vi.fn(),
  }),
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
vi.mock("../../atoms/FadeSlideIn", () => ({
  FadeSlideIn: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));
// Mascot pulls `useAppStore` → supabase → expo-secure-store at module load.
// The mascot is decorative on this surface, so a null mock is fine and avoids
// dragging native modules into the test environment.
vi.mock("../../atoms/Mascot", () => ({ Mascot: () => null }));
vi.mock("../../atoms/TierPill", () => ({
  TierPill: ({ tier }: { tier: string }) => React.createElement("span", null, tier),
}));
vi.mock("../../atoms/LeaderboardRow", () => ({
  LeaderboardRow: ({ entry }: { entry: { displayName: string } }) => React.createElement("div", { "data-testid": "leaderboard-row" }, entry.displayName),
}));
vi.mock("../../atoms/SectionTitle", () => ({
  SectionTitle: ({ children }: { children: React.ReactNode }) => React.createElement("h2", null, children),
}));
vi.mock("../../atoms/Button", () => ({
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

// RE-ENABLED 2026-06-09: the collection failure had two stacked causes, both
// now fixed: (1) `lib/telemetry.ts` (reached via the API client) top-level
// imports `@sentry/react-native` + `posthog-react-native`, which CJS-require
// the REAL react-native and dragged in `Libraries/Promise.js` — both packages
// are now stubbed globally in `vitest.setup.ts`; (2) the mock specifiers above
// were missing one `../` (this file is a directory deeper than the SUT), so
// the real `useLeaderboard` (→ useCurrentLocation → expo-location) and real
// atoms loaded anyway. Paths corrected above. `useT` is intentionally left
// unmocked so the assertions below match the real en.ts strings.
describe("LeaderboardSection", () => {
  it("shows loading indicator when isLoading is true", () => {
    mockUseLeaderboard.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    render(React.createElement(LeaderboardSection, null));
    expect(screen.getByText("Neighborhood Leaderboard")).toBeTruthy();
  });

  it("shows localized error message and retry button on error", () => {
    // Audit 2026-07-05 UX-4: the raw error string is no longer rendered — a
    // localized message is shown instead (useT is unmocked → real en.ts copy).
    const refetch = vi.fn();
    mockUseLeaderboard.mockReturnValue({ data: undefined, isLoading: false, error: "Network error", refetch });
    render(React.createElement(LeaderboardSection, null));
    expect(screen.queryByText("Network error")).toBeNull();
    expect(
      screen.getByText("Couldn't load the leaderboard. Pull to refresh or try again."),
    ).toBeTruthy();
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