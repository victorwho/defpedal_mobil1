export function formatDistanceKm(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? km.toFixed(1) : Math.round(km).toString();
}

export function formatDurationMin(seconds: number): string {
  const totalMin = Math.max(1, Math.round(seconds / 60));
  if (totalMin < 60) return `${totalMin}`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatDurationUnit(seconds: number): string {
  return seconds < 3600 ? 'min' : '';
}

export function initials(name: string | null): string {
  if (!name) return 'DP';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'DP';
}

/**
 * Word for a shared route's 0-100 SAFETY score (higher = better).
 *
 * This is NOT the road-risk band scale. Road risk is a per-segment score
 * (higher = worse) rendered as three tiers — Safer / Typical / High risk —
 * whose thresholds live server-side only. The two must not borrow each
 * other's vocabulary: labelling a route "High risk" here would read as the
 * road-risk tier and make a severity claim this number does not support.
 * Hence deliberately neutral quality words.
 *
 * ⚠️ The cuts below predate the b46v1 risk re-anchoring (2026-09-04) and have
 * not been re-validated against it. In practice nothing renders them today —
 * the app never sends `safetyScore` when sharing a route, so the value is
 * always null — but re-derive them before relying on this.
 */
export function safetyLabel(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 40) return 'Fair';
  if (score >= 20) return 'Poor';
  return 'Very poor';
}
