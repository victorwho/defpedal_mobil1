# Badge Icon Design Brief — Defensive Pedal

## Problem Statement

The current 137 badge icons are **hand-drawn SVG paths in a 24x24 viewBox** rendered as stroke-only outlines (`strokeWidth: 2, fill: none`). They look minimal, inconsistent, and disconnected from the app's premium dark-mode visual identity. Many icons are indistinguishable at small sizes (40x46 `sm`), and the stroke-only style clashes with the app's filled Ionicons used everywhere else.

## App Visual Identity (Must Match)

| Token | Value | Usage |
|-------|-------|-------|
| **Brand accent** | `#FACC15` (gold yellow) | CTAs, highlights, earned badges |
| **Dark background** | `#111827` → `#1F2937` → `#374151` | 3-tier depth system |
| **Light background** | `#FFFFFF` → `#F9FAFB` → `#F3F4F6` | Light theme |
| **Safety green** | `#22C55E` | Safe routes, positive stats |
| **Caution amber** | `#F59E0B` | Warnings, moderate risk |
| **Danger red** | `#EF4444` | Hazards, destructive actions |
| **Info blue** | `#3B82F6` | Neutral info, links |
| **Font system** | Montserrat (headings), Roboto (body), JetBrains Mono (data) | All screens |
| **Icon library** | `@expo/vector-icons/Ionicons` — **filled style** in nav, **outline style** in secondary controls | Entire app |
| **Corner radii** | 8 / 12 / 16 / 9999 (pill) | Cards, buttons, badges |
| **Spacing rhythm** | 4/8dp grid | Universal |

### Shield Container (Keep As-Is)
The shield-shaped container is the badge "frame" — it already has tier-colored borders, glow, gradient inner shine, progress rings, and tier pills. **Do not change the shield.** Only redesign what goes **inside** it — the icon overlay.

### Tier Colors (Context for Icon Contrast)
| Tier | Border/Glow | Icon renders as |
|------|------------|-----------------|
| Bronze | `#CD7F32` | White `#FFFFFF` on `#1F2937` fill |
| Silver | `#A8B4C0` | White on dark |
| Gold | `#F2C30F` | White on dark |
| Platinum | `#A8C4E0` | White on dark |
| Diamond | `#B0E0FF` | White on dark |
| Locked | `#374151` border | `#8B9198` muted, 50% opacity |
| Secret | Dashed `#374151` | `#8B9198` muted, "?" text |

### Category Colors (8 categories)
| Category | Color | Theme |
|----------|-------|-------|
| Firsts | `#FACC15` | Discovery, "first time" moments |
| Riding | `#F97316` | Distance, time, ride count |
| Consistency | `#EF4444` | Streaks, patterns, routines |
| Impact | `#22C55E` | CO2, money, environment |
| Safety | `#3B82F6` | Hazards, validation, quiz |
| Community | `#06B6D4` | Social, shares, likes |
| Explore | `#F59E0B` | Weather, climbing, athletic |
| Events | `#8B5CF6` | Seasonal, holidays, calendar |

---

## Design Direction

### Style: Filled Duotone Icons

Move from stroke-only line art to **filled duotone** icons. This means:

1. **Primary shape** = solid filled silhouette (renders in the icon color — white for earned, muted for locked)
2. **Secondary detail** = a smaller accent element at reduced opacity (0.5-0.6) or a cutout/negative space detail within the primary shape
3. **No outlines** — the icon is a solid mass, not a wireframe. This matches how Ionicons' filled variants work throughout the app

### Why Duotone Filled

- **Readability at 24px** (`sm` size): Stroke-only icons at 2px stroke width become muddy blobs at small sizes. Filled shapes remain recognizable
- **Visual weight**: The shield container is bold (colored border, glow, gradient). Stroke-only icons look weak inside it — like an empty frame. Filled icons have matching visual presence
- **Consistency**: The rest of the app uses Ionicons filled style (tab bar icons, control buttons, feature icons). Badge icons should match
- **Tier differentiation**: Filled icons with subtle inner details make the white-on-dark rendering pop. The tier glow wraps around a visually substantial shape rather than thin lines

### Optical Sizing

The icon area within the shield varies by badge size:

| Badge Size | Icon Area | Target Visual |
|-----------|-----------|---------------|
| `sm` (40x46) | 24x24 | Silhouette only — drop ALL secondary details. Must be recognizable as a single solid shape |
| `md` (64x74) | 36x36 | Primary fill + one accent detail (cutout, secondary shape at 0.5 opacity) |
| `lg` (120x139) | 64x64 | Full duotone — primary fill + secondary details + fine inner lines if needed |

For the SVG path data in `badgeIcons.ts`, design at the **md** level (the trophy case grid). The `sm` rendering will naturally simplify because the paths render smaller. The `lg` rendering adds the shield glow and tier pill which provide the extra detail.

### Geometric Construction Rules

1. **Grid**: Design on a 24x24 grid with 2px padding (safe area: 20x20 centered). No path should touch the 24x24 boundary
2. **Corner radius**: Use rounded endpoints (`strokeLinecap: round`, `strokeLinejoin: round`) when strokes are needed. Filled shapes should use smooth curves, no sharp 90-degree mechanical corners
3. **Optical center**: The shield's optical center is at roughly 42% height (not 50%) because the shield tapers at the bottom. Icons should be vertically centered around this point — the component already handles this via `top: (dims.height * 0.42) - (dims.iconArea / 2)`
4. **Minimum detail**: No path segment shorter than 2px at the `md` render size (36x36). At `sm` (24x24), details smaller than 3px disappear
5. **Consistent mass**: Every icon should fill approximately 60-75% of the 20x20 safe area. No icon should be a tiny dot in a sea of space, and none should bleed to the edges

### Path Data Format

Each icon in `badgeIcons.ts` uses this structure:

```typescript
export interface BadgeIconDef {
  /** SVG path data for stroked elements (stroke="currentColor" strokeWidth=2) */
  readonly paths: readonly string[];
  /** SVG path data for filled elements (fill="currentColor") */
  readonly fills?: readonly string[];
}
```

**For the new duotone style**, the rendering logic in `BadgeIcon.tsx` will need an update:

- `fills` array = **primary shapes** (solid fill at full icon opacity)
- `paths` array = **secondary detail lines** (stroke at reduced opacity, thinner strokeWidth ~1.5)

This is the **inverse** of the current convention where `paths` are the main content. The `renderIconPaths` function in `BadgeIcon.tsx` needs to render `fills` first (as the primary mass), then `paths` on top (as accent detail strokes).

### Icon Vocabulary (Per Category)

Every icon should tell a micro-story related to cycling safety. Use these motifs:

| Category | Primary Motifs | Avoid |
|----------|---------------|-------|
| **Firsts** | Bike wheel, pedal, road, shield, star burst, flag | Generic trophies, cups |
| **Riding** | Road perspective, bike silhouette, odometer, speedometer, legs/pedals | Cars, motors |
| **Consistency** | Flame, calendar, sunrise/sunset, chain links, heartbeat | Clocks (too generic) |
| **Impact** | Leaf, earth, coin, lungs, tree, CO2 molecule | Dollar signs (app uses EUR) |
| **Safety** | Shield, eye, warning triangle, traffic cone, crosswalk, bike lane | Skull/crossbones |
| **Community** | People silhouettes, speech bubbles, hands, high-five, megaphone | Social media logos |
| **Explore** | Mountain, compass, weather elements, thermometer, wind | Airplane, globe |
| **Events** | Calendar, snowflake, sun, heart, fireworks, seasonal leaf | Text dates |

### Specific Icon Redesign Priorities

These are the most visible badges (shown in Trophy Case grid, post-ride summary, unlock overlay):

**Critical (most earned/seen):**
- `first_ride` — needs a strong "first pedal stroke" moment, not just a crank arm
- `road_warrior` (distance tiers) — road vanishing to horizon is good concept but too skeletal
- `iron_streak` (streak tiers) — flame is the right motif, needs solid mass
- `green_machine` (CO2 tiers) — leaf should feel lush, not a single outline
- `road_guardian` (hazard tiers) — shield+eye is the right concept, needs weight

**Important (frequently unlocked):**
- `saddle_time` — clock is too generic, consider a bike-specific timer
- `pedal_counter` — tally marks are invisible at small sizes
- `validator` — circle+check looks like a generic "done" icon
- `social_cyclist` — megaphone doesn't say "cycling community"
- `quiz_master` — graduation cap is generic, consider a brain or quiz-card motif

**Hidden/Easter egg (low priority but fun):**
- Keep these simple and mysterious — the "?" secret state does most of the work

---

## Rendering Changes Required in BadgeIcon.tsx

### Current Rendering (stroke-only)
```tsx
// paths rendered with stroke, no fill
<Path d={d} stroke={color} strokeWidth={2} fill="none" />
// fills rendered as solid shapes
<Path d={d} fill={color} />
```

### Target Rendering (filled duotone)
```tsx
// PRIMARY: fills rendered first as solid mass
<Path d={d} fill={color} opacity={opacity} />
// SECONDARY: paths rendered on top as thin accent strokes
<Path d={d} stroke={color} strokeWidth={1.5} fill="none" opacity={opacity * 0.6} />
```

The change is in `renderIconPaths()` at `BadgeIcon.tsx:95-131`:
1. Render `fills` first (main visual mass) with full `opacity`
2. Render `paths` second (detail accents) with `opacity * 0.6` and `strokeWidth: 1.5`
3. For icons that only have `paths` (legacy/not-yet-redesigned), keep current behavior as fallback

---

## Quality Checklist

Before finalizing each icon:

- [ ] **Recognizable at 24x24**: Can you identify the badge theme from the silhouette alone at `sm` size?
- [ ] **Fills 60-75% of safe area**: Not too sparse, not touching edges
- [ ] **Consistent visual weight**: Compare side-by-side with other icons in the same category — similar density
- [ ] **Works in white on dark**: The primary rendering context. No thin lines that disappear
- [ ] **Works in muted gray at 50% opacity**: The locked state. Shape should still read
- [ ] **Matches Ionicons weight**: Put the badge next to an Ionicons filled icon (e.g., `bicycle`, `shield-checkmark`, `flame`). Similar optical mass?
- [ ] **No tiny details under 2px**: Remove fine filigree that disappears when rendered
- [ ] **Cycling DNA**: Does this icon feel like it belongs in a cycling safety app? Every icon should whisper "bike"
- [ ] **SVG paths fit 24x24 viewBox**: All coordinates within 2-22 range (2px padding)
- [ ] **Both light and dark theme**: White icon on `#1F2937` AND dark icon on `#F9FAFB` — both readable

---

## Batch Plan

Redesign in category order, most-visible first:

1. **Riding** (4 icons, tiered — most shown in Trophy Case)
2. **Consistency** (6 icons — streaks are a core engagement loop)
3. **Firsts** (11 icons — everyone earns these)
4. **Safety** (10 icons — core app identity)
5. **Impact** (2 icons, tiered — CO2/money)
6. **Community** (4 icons — social features)
7. **Explore** (13 icons — weather/climbing)
8. **Events** (seasonal — least urgent, time-locked)

Total: ~50 unique icon designs (tiered families share one icon).

---

## Reference: Current Icon Count by Category

| Category | Families | Icons | Notes |
|----------|----------|-------|-------|
| Firsts | 11 | 11 | All unique one-time badges |
| Riding | 4 | 20 | 4 families x 5 tiers each |
| Consistency | 6 | 16 | 2 tiered (5 each) + 4 one-time |
| Impact | 2 | 10 | 2 families x 5 tiers each |
| Safety | 10 | 20 | 4 tiered (5 each) + 6 one-time |
| Community | 4 | 20 | 4 families x 5 tiers each |
| Explore | 13 | 23 | 3 tiered (5 each) + 8 one-time |
| Events | — | 17 | All one-time seasonal/calendar |
| **Total** | **~50** | **137** | 50 unique designs needed |
