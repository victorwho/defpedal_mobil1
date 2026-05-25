/**
 * Badge Icon Paths — SVG fallback registry.
 *
 * HISTORICAL: This file used to hold ~650 lines of inline SVG `d` attributes
 * for every badge — bicycle silhouettes, shields, lightning bolts, etc. — so
 * `BadgeIcon` could render a duotone icon inside its shield shape. Every
 * badge in the catalog (147/147 as of v0.2.75) now has a holographic PNG in
 * `tokens/holoBadges.ts`, and the `BadgeVisual` wrapper resolves to the holo
 * sticker for every earned badge. The duotone paths are no longer reachable
 * for any production-known badge.
 *
 * The map is intentionally kept empty rather than deleted so future badges
 * added to the DB schema without holo art still resolve cleanly: `BadgeIcon`
 * renders its shield outline + tier border without an inner icon, which is a
 * usable placeholder until the art lands. Re-adding entries here is also
 * available as an explicit override if a badge needs a custom SVG mark.
 *
 * If you're looking for the path data the icons used to ship with, it's in
 * the git history.
 */

export interface BadgeIconDef {
  /** SVG path data for stroked accent details (d attribute). */
  readonly paths: readonly string[];
  /** SVG path data for filled primary shapes. */
  readonly fills?: readonly string[];
}

export const badgeIconPaths: Record<string, BadgeIconDef> = {};

/**
 * Look up icon data for a badge. Falls back to tier_family if `badgeKey` isn't
 * a top-level entry. Returns undefined when nothing matches — `BadgeIcon`
 * handles that by rendering the shield outline with no inner icon.
 */
export function getBadgeIcon(
  badgeKey: string,
  tierFamily?: string | null,
): BadgeIconDef | undefined {
  return badgeIconPaths[badgeKey] ?? (tierFamily ? badgeIconPaths[tierFamily] : undefined);
}
