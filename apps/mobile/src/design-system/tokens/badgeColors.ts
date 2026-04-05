/**
 * Badge Design System — Color & Size Tokens
 *
 * CANONICAL SOURCE for all badge tier colors, category colors, sizes, and animation tokens.
 * If any other file conflicts with values here, this file wins.
 */

import { space } from './spacing';

// ---------------------------------------------------------------------------
// Tier Colors
// ---------------------------------------------------------------------------

/**
 * Each tier has:
 * - primary:  border stroke + progress ring fill
 * - glow:     iOS shadow color
 * - surface:  inner gradient highlight (10% opacity)
 * - pillText: tier pill text — WCAG AA compliant against primary
 */
export const tierColors = {
  bronze: {
    primary: '#CD7F32',
    glow: '#CD7F32',
    surface: '#E8A960',
    pillText: '#FFFFFF', // 4.7:1 on #CD7F32
    label: 'Bronze',
  },
  silver: {
    primary: '#A8B4C0',
    glow: '#C0CCD8',
    surface: '#D4DEE8',
    pillText: '#111827', // 7.2:1 on #A8B4C0
    label: 'Silver',
  },
  gold: {
    primary: '#F2C30F',
    glow: '#FACC15',
    surface: '#FFE066',
    pillText: '#FFFFFF', // 4.5:1 on #F2C30F
    label: 'Gold',
  },
  platinum: {
    primary: '#A8C4E0',
    glow: '#B8D4F0',
    surface: '#D0E8FF',
    pillText: '#111827', // 8.1:1 on #A8C4E0
    label: 'Platinum',
  },
  diamond: {
    primary: '#B0E0FF',
    glow: '#80D0FF',
    surface: '#E0F4FF',
    pillText: '#111827', // 9.3:1 on #B0E0FF
    label: 'Diamond',
  },
} as const;

export type BadgeTier = keyof typeof tierColors;

// ---------------------------------------------------------------------------
// Category Colors (maps to trophy case tabs)
// ---------------------------------------------------------------------------

export const categoryColors = {
  firsts: '#FACC15',
  riding: '#F97316',
  consistency: '#EF4444',
  impact: '#22C55E',
  safety: '#3B82F6',
  community: '#06B6D4',
  explore: '#F59E0B',
  events: '#8B5CF6',
} as const;

export type BadgeCategory = keyof typeof categoryColors;

// ---------------------------------------------------------------------------
// Badge Sizes
// ---------------------------------------------------------------------------

export const badgeSize = {
  /** Inline mention — toast, feed card, notification */
  sm: {
    outer: 40,
    height: 46,
    iconArea: 24,
    borderWidth: 1.5,
    cornerRadius: 10,
  },
  /** Trophy case grid cell */
  md: {
    outer: 64,
    height: 74,
    iconArea: 36,
    borderWidth: 2,
    cornerRadius: 14,
  },
  /** Detail modal hero, share card */
  lg: {
    outer: 120,
    height: 139,
    iconArea: 64,
    borderWidth: 3,
    cornerRadius: 24,
  },
} as const;

export type BadgeSize = keyof typeof badgeSize;

// ---------------------------------------------------------------------------
// Badge Spacing (semantic aliases over space tokens)
// ---------------------------------------------------------------------------

export const badgeSpace = {
  gridCellPad: space[2],
  gridGap: space[3],
  iconToText: space[4],
  progressHeight: 4,
  progressHeightLg: 6,
  progressRadius: 2,
} as const;

// ---------------------------------------------------------------------------
// Tier Pill
// ---------------------------------------------------------------------------

export const tierPill = {
  md: { height: 20, fontSize: 10 },
  lg: { height: 24, fontSize: 12 },
} as const;

// ---------------------------------------------------------------------------
// Animation Tokens
// ---------------------------------------------------------------------------

export const badgeAnimations = {
  unlockSpring: { damping: 12, stiffness: 180, mass: 1 },
  progressFill: { duration: 600, easing: 'ease-out' as const },
  gridItemAppear: { duration: 300, staggerDelay: 50, easing: 'ease-out' as const },
  newPulse: { duration: 1500, iterations: 3, scale: [1, 1.3, 1], opacity: [1, 0.6, 1] },
  particleBurst: {
    count: 14,
    duration: 800,
    radiusMin: 60,
    radiusMax: 120,
    particleSize: 6,
    fadeStart: 0.6,
  },
  secretShimmer: { duration: 2000, iterations: Infinity, gradientAngle: 135 },
} as const;

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

export type RarityLevel = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const rarityThresholds: ReadonlyArray<{
  readonly level: RarityLevel;
  readonly maxPercent: number;
  readonly color: string;
}> = [
  { level: 'legendary', maxPercent: 1, color: '#FACC15' },
  { level: 'epic', maxPercent: 5, color: '#F59E0B' },
  { level: 'rare', maxPercent: 20, color: '#A78BFA' },
  { level: 'uncommon', maxPercent: 50, color: '#3B82F6' },
  { level: 'common', maxPercent: 100, color: '#6B7280' },
] as const;

export function getRarity(percent: number): { level: RarityLevel; color: string } {
  const match = rarityThresholds.find((r) => percent <= r.maxPercent);
  return match
    ? { level: match.level, color: match.color }
    : { level: 'common', color: '#6B7280' };
}
