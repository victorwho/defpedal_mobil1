# Archive

Finished one-off documents, moved out of the repo root on **2026-08-15** so the
root only carries living docs. Nothing here is maintained. Kept because the
reasoning is still useful and `progress.md` / `changelog.md` history links to it.

**If you are looking for current guidance, do not read these** — use the
pointers in the right-hand column instead.

| Archived file | What it was | Current source |
|---|---|---|
| `mobile_implementation_plan.md` | Original RN migration plan (2026-03) | `progress.md` + `.claude/CLAUDE.md` |
| `mobile_stable_baseline_plan.md` | Hardening plan for the first stable baseline | `progress.md` |
| `mobile_api_operations_runbook.md` | API ops procedures (2026-03) | `docs/runbooks/monitoring.md`, `docs/ops/*` |
| `mobile_api_load_test_baseline.md` | Local route-core load-test evidence | — (re-measure if needed) |
| `native_android_validation.md` | Android release-style validation flow | `apkreleases/release-notes-template.txt` smoke checklist |
| `physical_android_validation.md` | Physical-device checklist | same as above |
| `iphone_validation.md` | Placeholder for the first iPhone smoke pass | `docs/runbooks/ios-app-store-submission.md` |
| `iphone_deploy_guide.md` | Early iOS deploy notes | same as above |
| `securityfix.md` | Risk-Score IP protection fixes (2026-04, shipped) | `.claude/CLAUDE.md` "Security hardening"; tests in `security-risk-ip.test.ts` |
| `issuefix.md` | Codebase review 2026-04-11 (67/69 fixed) | `docs/reviews/` |
| `review-report-2026-04-08.md` | 8-category audit | `docs/reviews/` |
| `action-plan-2026-04-08.md` | Action plan for the above | `docs/reviews/` |
| `review-report-2026-05-04.md` | /review bug-fix sweep | `docs/reviews/` |
| `habit-engine-phone-tests.md` | Habit-engine device test notes | — |
| `socialsharing.md` | Image-sharing migration tracker (shipped) | `.claude/CLAUDE.md` share sections |
| `design1.md`, `designplan1-revised.md` | Early design explorations | `docs/design-context.md`, `docs/plans/design-audit-implementation.md` |
| `HANDOFF.md` | Handoff for the `design-quality-pass` worktree (never committed) | `docs/plans/design-audit-implementation.md` |

## Still at the root, still live

`README.md`, `ARCHITECTURE.md`, `CONTEXT.md`, `AGENTS.md`, `progress.md`,
`changelog.md`, `TODO.md`, `changestoimplement.md` (TODO.md links into it by
line), `sentryfix.md` (non-code follow-ups open; referenced from CI + app
config comments), `mobile_release_runbook.md` (named in a Gradle error
message; partly superseded — see its own banner).
