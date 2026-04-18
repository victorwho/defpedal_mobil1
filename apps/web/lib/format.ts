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

export function safetyLabel(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 80) return 'Very safe';
  if (score >= 60) return 'Safe';
  if (score >= 40) return 'Moderate';
  if (score >= 20) return 'Caution';
  return 'Dangerous';
}
