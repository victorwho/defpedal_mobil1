# Mobile lint — setup & usage

**Phase 1 · R1 of the Design Quality Pass (see `docs/plans/design-audit-implementation.md`).**

## What this enforces

### Color (R1)

Raw hex colours (`'#FFFFFF'`, `'#fff'`) and inline `rgba()` / `rgb()` values are **banned** inside `apps/mobile/app/**`. All colour must come through the design system:

- Theme-aware: `const { colors } = useTheme(); colors.bgPrimary`
- Safety semantics: `const danger = useSafetyColor('danger')` (Phase 3)
- Tints: `import { surfaceTints } from '../src/design-system/tokens/tints'`

Allowed exceptions (inline `// eslint-disable-next-line no-restricted-syntax` + rationale comment):
1. Mapbox layer style objects (Mapbox doesn't read theme tokens).
2. Map overlay cards that intentionally use `#FFFFFF` over the dark map (origin/destination/search/FABs).

### Toggle atom — must go through SettingRow (R7)

Importing `Toggle` directly in screen code (`apps/mobile/app/**`) is **banned**. Use `<SettingRow>` from `src/design-system/molecules/` for boolean settings — it composes `Toggle` correctly with label, description, and accessibility wiring.

For non-row toggle UI (chip toggles, checkbox-style options, accordion handles), build a new molecule in `src/design-system/molecules/` rather than inlining `Toggle`. Examples of intentional alternative patterns already in the kit:
- `ShareOptionsModal` — checkbox-style "hide endpoints" toggle (deliberate visual variant).
- `NearbySheet` — chip-toggle category switches (deliberate visual variant).

Rules live in `apps/mobile/.eslintrc.cjs`. Rationale in `docs/design-context.md` §2 + §5.

## First-time setup (one command from repo root)

```bash
npm install                                    # installs eslint + @typescript-eslint/parser
npm run lint:mobile:baseline                   # captures current violations as the baseline
git add apps/mobile/.eslint-baseline.json      # commit the snapshot
```

After that, the ratchet is active: CI (once wired — see below) fails if any file has **more** violations than its baseline, or if a previously-clean file gains any.

Baseline is not a "cleanup debt" file — it's a ratchet. Developers cleaning up violations should also re-run `npm run lint:mobile:baseline` to lock in the lower counts. Phase 2 R10 (per-screen light-mode PRs) will naturally drive the baseline to zero.

## Daily commands

| Command | What it does |
|---|---|
| `npm run lint --workspace @defensivepedal/mobile` | Strict: fail on any warning/error. Use locally for a hard check. |
| `npm run lint:fix --workspace @defensivepedal/mobile` | Attempt auto-fix where possible (hex/rgba rules have no auto-fix; prose changes only). |
| `npm run lint:check --workspace @defensivepedal/mobile` | **Ratchet mode**: fail only on regressions vs baseline. CI uses this. |
| `npm run lint:baseline --workspace @defensivepedal/mobile` | Regenerate `.eslint-baseline.json` from current state. |

Top-level aliases exist at the repo root: `npm run lint:mobile`, `npm run lint:mobile:check`, `npm run lint:mobile:baseline`.

## Wiring into CI (deferred until baseline is committed)

After the baseline file is committed and the repo is clean of regressions, add this step to `.github/workflows/ci.yml` between the audit and validate steps:

```yaml
      - name: Lint ratchet (mobile)
        run: npm run lint:mobile:check
```

Keep it **before** `npm run validate` so lint failures are caught early.

Do NOT add it to the `npm run validate` script — that script is used by other tooling (dev workflows, pre-push hook) and should stay focused on typecheck + build. Keep lint as a CI-only gate until the baseline is at zero, at which point we can escalate.

## Troubleshooting

**`ESLint binary not found`** — you haven't run `npm install` since these changes. From repo root: `npm install`.

**Regression reported for a file I didn't touch** — someone else's PR likely landed a violation. Pull latest; the baseline should have been updated in that merge. If it wasn't, that's a review miss; open a follow-up.

**I intentionally added a violation (e.g. an allow-listed exception with an inline disable)** — the inline `// eslint-disable-next-line` makes ESLint not count it, so the baseline is unaffected. If a whole section needs to be excluded, prefer a PR discussion over editing the config.

**I just fixed 10 violations and CI still fails** — you didn't update the baseline. Run `npm run lint:mobile:baseline` and commit the change.
