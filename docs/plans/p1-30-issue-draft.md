# Draft GitHub issue body — P1-30

> **Status:** Draft, awaiting user approval before `gh issue create`.
> **Repo:** `victorwho/defpedal_mobil1`
> **Title:** `P1-30: Design quality pass — lint, light mode, empty states, motion discipline, onboarding polish`
> **Labels (suggested):** `enhancement`, `design-system`
> **Milestone:** none (ongoing 8-week stream)

---

## Summary

Execute the design audit recommendations (`docs/plans/design-audit-implementation.md`) as an interleaved hygiene + visible-wins stream. 8 weeks, ~1 eng-week/week, every phase ships something a user can feel.

Source audit: `.claude/design-bundle/def-pedal-1/project/Design Audit.html` (2026-04-18), revised after re-audit and UX review (2026-04-24).

## Direction

- **Ship both dark AND light themes.** Inverts the audit's original dark-only recommendation.
- **Every phase delivers a user-visible improvement**, not 8 weeks of invisible refactors.
- **Safety rules are inviolable:** forced-dark during `NAVIGATING`, zero ambient motion in `NAVIGATING`, haptics paired with visual signals.

## Phase breakdown

- [ ] **Phase 0 · Set the table** (Week 0, 1 day)
  - [x] `docs/design-context.md` created
  - [x] CLAUDE.md §Design System references the new doc
  - [ ] This issue filed
- [ ] **Phase 1 · Stop the bleeding + haptic win** (Week 1)
  - [ ] R1 · ESLint infra + hex ban with baseline ratchet
  - [ ] R5 · Contrast + colour-not-only CI gate (both themes)
  - [ ] R7 · `SettingRow` adopted in `settings.tsx`, `diagnostics.tsx`, `profile.tsx`
  - [ ] R14 · Haptic calibration map (visible win)
- [ ] **Phase 2 · Light mode + empty states + accent discipline** (Weeks 2–4)
  - [ ] R10 · Light-mode QA pass across 27 screens (+ ambient-light auto-dark + picker warning)
  - [ ] R2 · Zero raw hex / `rgba()` in `apps/mobile/app/**`
  - [ ] R3 · `<Surface>` (= `<Card>`) with `elevation` prop, rolled out across monoliths
  - [ ] Refinement 02 + 04 · Warm neutrals + radii 16→20 (bundled token tweaks)
  - [ ] R11 · Empty / error / loading state audit (visible win)
  - [ ] R13 · Accent-discipline sweep — one primary CTA per viewport (visible win)
- [ ] **Phase 3 · Guardrails + motion + post-ride polish** (Weeks 5–6)
  - [ ] R4 · `/design` in-app catalog (`__DEV__`)
  - [ ] R8 · `useSafetyColor(level)` hook; direct safety-colour imports removed from public index
  - [ ] R9 · Hit-target + Dynamic Type + thumb-reach audit
  - [ ] R12 · Motion discipline audit (visible win)
  - [ ] Post-ride celebration tuning (visible win)
- [ ] **Phase 4 · Decompose + onboarding + close** (Weeks 7–8)
  - [ ] R6-scoped · `route-planning.tsx` decomposed (≤ 400 LOC)
  - [ ] R15 · Onboarding polish pass (visible win)
  - [ ] Docs close-out: `docs/design-context.md` updated, CLAUDE.md §Design System updated, re-score vs. audit

## Explicit drops

- Serif / humanist display font (Refinement 01) — geometric clarity wins for a navigation product at speed.
- Duotone safety glyphs (Refinement 08) — deferred until designer capacity.
- Decomposition of `navigation.tsx` and `route-preview.tsx` — stable, well-tested, no user-visible gain.
- "Ambient motion" as a feature — reframed as R12 motion discipline audit.

## Parallel / non-blocking dependency

- P1-21 phase 3 TalkBack QA on physical Android device — runs parallel to this stream.

## Links

- Plan: `docs/plans/design-audit-implementation.md`
- Rules: `docs/design-context.md`
- Source audit: `.claude/design-bundle/def-pedal-1/project/Design Audit.html`
