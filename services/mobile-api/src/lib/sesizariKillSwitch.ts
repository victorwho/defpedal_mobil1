/**
 * Sesizări — kill switch (`SESIZARI_ENABLED`).
 *
 * Gates the civic-complaint handoff to civia.ro: `POST /v1/sesizari` answers
 * 403 and `GET /v1/profile` reports `sesizariEnabled: false`, which hides
 * every client surface.
 *
 * Read at call time rather than at module load (same idiom as
 * `nudges/killSwitch.ts`) so the flag is testable and does not depend on a
 * cold start to take effect. Defaults to ON — flipping it off is the explicit
 * ops action:
 *   gcloud run services update defpedal-api --region europe-central2 \
 *     --update-env-vars SESIZARI_ENABLED=false \
 *     --project gen-lang-client-0895796477
 *
 * Why this exists at all: the whole feature is a link into a third-party site
 * that launched in April 2026. If civia.ro moves or breaks, this is the lever
 * between store releases. See docs/plans/sesizari-civia.md §6.3.
 */
export const isSesizariEnabled = (): boolean => {
  const raw = (process.env.SESIZARI_ENABLED ?? '').trim().toLowerCase();
  // Only explicit "false" / "0" / "off" disables. Unset, "true" and typos all
  // leave the feature live.
  return !(raw === 'false' || raw === '0' || raw === 'off');
};
