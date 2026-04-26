# Contrast baseline

**Phase 1 · R5 of the Design Quality Pass (P1-30).**
**Last updated:** 2026-04-25
**Source:** [`apps/mobile/src/design-system/tokens/__tests__/contrast.test.ts`](../apps/mobile/src/design-system/tokens/__tests__/contrast.test.ts)

This file records every `{foreground, background}` pair declared by the audited components, with its WCAG AA contrast ratio in both themes. The companion test file enforces a ratchet — known regressions stay allow-listed; new failures or regressions in existing pairs break CI.

**The standards (WCAG 2.1 AA):**
- Body text: ≥ **4.5:1**
- Large text (≥ 18pt or 14pt bold): ≥ **3:1**
- Non-text UI components & graphics: ≥ **3:1**

---

## 1. How to regenerate this file

```bash
cd apps/mobile
npx vitest run src/design-system/tokens/__tests__/contrast.test.ts --reporter=verbose
```

The test output prints the actual ratios for every pair. Pairs in `KNOWN_REGRESSIONS` show as "skipped allow-listed"; new failures show their ratio in the error message. Update both this file and the test's `KNOWN_REGRESSIONS` array when colour tokens change.

The pure WCAG calculator lives in `packages/core/src/contrast.ts` and exports `contrast(fg, bg)` for ad-hoc checks.

---

## 2. Component pairs — passing

Pairs that meet WCAG AA today. The component reference points to where the pair is declared.

### Button (theme-independent — uses darkTheme tokens)
| Pair | fg | bg | Ratio | Verdict |
|---|---|---|---|---|
| primary text | `textInverse` `#111827` | `accent` `#FACC15` | 11.58 | ✅ AAA |
| secondary text | `textPrimary` `#FFFFFF` | `bgSecondary` `#374151` | 10.31 | ✅ AAA |
| ghost text on dark | `accent` `#FACC15` | `bgDeep` `#111827` | 11.58 | ✅ AAA |

### Badge (theme-independent — uses tinted safety colors)
| Pair | fg | bg | Ratio | Verdict |
|---|---|---|---|---|
| risk-safe | `safeText` `#166534` | `safeTint` `#DCFCE7` | 6.49 | ✅ AA |
| risk-caution | `cautionText` `#92400E` | `cautionTint` `#FEF3C7` | 6.37 | ✅ AA |
| risk-danger | `dangerText` `#991B1B` | `dangerTint` `#FEE2E2` | 6.80 | ✅ AA |
| info | `infoText` `#1E40AF` | `infoTint` `#DBEAFE` | 7.15 | ✅ AAA |
| neutral | `gray[300]` `#D1D5DB` | `bgSecondary` `#374151` | 7.00 | ✅ AAA |
| accent | `textInverse` `#111827` | `accent` `#FACC15` | 11.58 | ✅ AAA |

### HazardAlertPill
| Pair | fg | bg | Ratio | Verdict |
|---|---|---|---|---|
| danger | `#FFFFFF` | `danger` `#EF4444` | 3.76 | ✅ large (3:1) |

### ManeuverCard (forced dark — uses darkTheme tokens)
| Pair | fg | bg | Ratio | Verdict |
|---|---|---|---|---|
| distance text | `#FFFFFF` | `bgPrimary` `#1F2937` | 14.68 | ✅ AAA |
| street name secondary | `gray[300]` `#D1D5DB` | `bgPrimary` `#1F2937` | 9.96 | ✅ AAA |
| next-distance label | `gray[300]` `#D1D5DB` | `bgPrimary` `#1F2937` | 9.96 | ✅ AAA |

### BottomNav — dark theme
| Pair | fg | bg | Ratio | Verdict |
|---|---|---|---|---|
| active label/icon | `accent` `#FACC15` | `bgPrimary` `#1F2937` | 9.59 | ✅ AAA |
| inactive label/icon | `gray[400]` `#9CA3AF` | `bgPrimary` `#1F2937` | 5.78 | ✅ AA |

### SettingRow
| Theme | Pair | fg | bg | Ratio | Verdict |
|---|---|---|---|---|---|
| dark | title | `textPrimary` `#FFFFFF` | `bgPrimary` `#1F2937` | 14.68 | ✅ AAA |
| dark | description | `textSecondary` `#B0B8C1` | `bgPrimary` `#1F2937` | 7.32 | ✅ AAA |
| light | title | `textPrimary` `#111827` | `bgPrimary` `#FFFFFF` | 17.74 | ✅ AAA |
| light | description | `textSecondary` `#6B7280` | `bgPrimary` `#FFFFFF` | 4.83 | ✅ AA |

### Card
| Theme | Pair | fg | bg | Ratio | Verdict |
|---|---|---|---|---|---|
| dark | primary text on solid card | `textPrimary` `#FFFFFF` | `bgPrimary` `#1F2937` | 14.68 | ✅ AAA |
| dark | secondary text on solid card | `textSecondary` `#B0B8C1` | `bgPrimary` `#1F2937` | 7.32 | ✅ AAA |
| light | primary text on solid card | `textPrimary` `#111827` | `bgPrimary` `#FFFFFF` | 17.74 | ✅ AAA |
| light | secondary text on solid card | `textSecondary` `#6B7280` | `bgPrimary` `#FFFFFF` | 4.83 | ✅ AA |

---

## 3. Known regressions (allow-listed in `KNOWN_REGRESSIONS`)

Failing pairs the ratchet permits today. **Each is accompanied by a recommended fix.** Phase 2 R10 (per-screen light-mode sweep) is the natural place to drive these to zero — when each one is fixed, remove its entry from `KNOWN_REGRESSIONS` and add it to §2 above.

| # | Pair | Ratio | Required | Fix hint |
|---|---|---|---|---|
| 1 | `Button::danger text` (white on `#EF4444`) | 3.76 | 4.5 (body) | Either darken the danger bg (try red-600/700) or escalate text size to "large" (3:1 threshold met). |
| 2 | `Button::safe text` (white on `#22C55E`) | **2.28** | 4.5 (body) | Use a darker green (try green-700 `#15803D` ≈ 4.6:1) or use `textInverse` instead of white. |
| 3 | `Button::ghost text on light` (`#CA8A04` on `#F9FAFB`) | 2.81 | 4.5 (body) | Darken `lightTheme.accentText` for light mode to ≥ `#845A04` (4.5:1). |
| 4 | `HazardAlertPill::safe` (white on `#22C55E`) | **2.28** | 3.0 (large) | Pin HazardAlertPill safe variant to a darker green or use `safetyColors.safeText` (`#166534`) on `#DCFCE7`. |
| 5 | `HazardAlertPill::caution` (white on `#F59E0B`) | **2.15** | 3.0 (large) | Use a darker amber bg or switch to dark text. |
| 6 | `BottomNav::active label/icon` light (`#CA8A04` on `#FFFFFF`) | 2.94 | 4.5 (body) | Same root cause as #3 — darken `lightTheme.accent`. |
| 7 | `BottomNav::inactive label/icon` light (`gray[400]` `#9CA3AF` on `#FFFFFF`) | 2.54 | 4.5 (body) | `BottomNav.tsx` uses `gray[400]` for inactive in BOTH themes — switch to a theme-aware token (`lightTheme.textMuted` `#737B85` ≈ 4.6:1) for the light branch. |

**Severity grouping:**
- **Severe** (#2, #4, #5): white text on saturated green/amber — fails even relaxed thresholds. Highest fix priority.
- **Moderate** (#3, #6, #7): light-theme regressions surfaced by R5 — Phase 2 R10 light-mode sweep is the natural fix point.
- **Minor** (#1): borderline; passes if reclassified as "large".

---

## 4. WCAG 1.4.1 — color-not-only encoding

Every safety-coloured component must carry a non-colour signal so colourblind users get the same meaning. The test asserts this manifest is exhaustive (any new safety-coloured component must add an entry).

| Component | Encoding | Evidence |
|---|---|---|
| Badge | text-label | `variantLabel` constant in `atoms/Badge.tsx` maps risk variants → "Safe"/"Caution"/"Danger" |
| HazardAlertPill | icon + text | renders message + iconColor; severity matches an Ionicons hazard glyph |
| RiskDistributionCard | text-label | renders `entry.category.label` (Safe/Caution/Danger) and percentage% next to each segment |
| StreakCard | text-label | day-state copy ("Today" / "Yesterday" / at-risk) carries meaning beyond colour |
| HazardLayers (map markers) | icon | uses `hazardIcons.ts` mapping per `HazardType` — icon shape disambiguates beyond colour |
| SteepGradeIndicator | icon + text | renders ⚠ icon + "Steep" label, not just colour |

---

## 5. Out of scope (intentionally not gated by R5)

- **Mapbox layer style objects** — Mapbox-rendered text/markers use the Mapbox style spec; their contrast against tile imagery is dynamic and tested via Phase 3's HUD-overlay manual QA, not the static gate.
- **Map overlay cards over the dark map (`#FFFFFF` bg)** — these intentionally use a fixed white surface regardless of theme; their pairs against the moving map base are not statically testable.
- **Component pairs not in the §2 manifest** — only the seven components listed in the R5 plan are gated. Adding more components to the manifest should follow the same pair-declaration pattern.

---

## 6. CI

`npm run check:contrast` (top-level) or `npm run check --workspace @defensivepedal/mobile` runs the contrast test in isolation. It exits non-zero on any new failure or regression, but passes for known allow-listed pairs that are at-or-near their baseline ratio.

Wire into the CI workflow alongside `npm run lint:mobile:check` once both are stable on `main`. See [`apps/mobile/LINT.md`](../apps/mobile/LINT.md) for the same wiring pattern.
