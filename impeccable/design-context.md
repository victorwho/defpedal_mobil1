# Impeccable Design Context

## Design Context

### Users

**Who they are:** Urban cyclists — commuters navigating daily routes and recreational riders exploring cities. They range from cautious beginners to confident regulars, but all share a desire to feel safe on roads not designed for them.

**Their context:** Using the app while cycling means split-second glances at the screen. They're managing traffic, weather, and physical effort simultaneously. Cognitive load is high; attention is precious.

**The job to be done:** Get from A to B on routes that minimize real danger — not just distance or time. Report hazards to help fellow cyclists. Track progress and feel good about choosing to ride.

### Brand Personality

**Three words:** Friendly, Protective, Trustworthy

**Voice:** Approachable but credible. Not a stern authority figure, but a knowledgeable friend who genuinely cares about your safety. Celebrates wins without being patronizing. Technical when it matters, human when it counts.

**Emotional goals:**
- **Confidence** — "I know this route is safer because real data backs it up"
- **Curiosity** — "I wonder what my impact looks like this week"
- **Joy** — "I earned a badge! My streak is growing!"

### Aesthetic Direction

**Visual tone:** Modern, warm, safety-conscious. Dark backgrounds provide focus and reduce glare outdoors. Yellow accent (`#FACC15`) signals energy, optimism, and the brand itself — it's the pedal's signature.

**References:**
- [defensivepedal.com](https://www.defensivepedal.com/) — Yellow + dark palette, real-world cycling photography, celebration-forward copy ("You're In!"), three-step visual flows
- Waze — Community hazard reporting, playful gamification, but with more restraint
- Strava — Achievement system inspiration, but less competitive, more personal

**Anti-references:**
- NOT clinical or sterile (no hospital-white interfaces)
- NOT corporate or enterprise (no dense data tables, no jargon)
- NOT overly playful or cartoonish (safety is serious, even when fun)

**Theme:** Dark mode only (for now). Light theme tokens exist but are inactive.

### Design Principles

1. **Safety is semantic, never decorative**
   Green/amber/red carry life-or-death meaning. Never use safety colors for branding, decoration, or non-safety status. When a cyclist sees red, it must mean danger.

2. **Glanceable at 25 km/h**
   Navigation and route screens must communicate instantly. Large type, high contrast, minimal cognitive load. If it takes more than a glance to understand, redesign it.

3. **Celebrate progress, not pressure**
   Badges, streaks, and impact stats should spark joy, not anxiety. No guilt trips for missed days. No aggressive push notifications. Reward consistency, not obsession.

4. **Trust through transparency**
   Show the "why" behind route choices. Risk scores, hazard counts, community validations. Users trust what they understand.

5. **Community over competition**
   The feed shows shared trips and hazard reports, not leaderboards. Cyclists help cyclists. The enemy is dangerous infrastructure, not each other.

---

## Design Tokens Summary

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `bgDeep` | `#111827` | Deepest background layer |
| `bgPrimary` | `#1F2937` | Cards, sheets, primary surfaces |
| `bgSecondary` | `#374151` | Secondary surfaces, inputs |
| `accent` | `#FACC15` | Brand yellow — buttons, active states, highlights |
| `safe` | `#22C55E` | Risk 0-2, confirmations, positive actions |
| `caution` | `#F59E0B` | Risk 3-5, warnings, hazard alerts |
| `danger` | `#EF4444` | Risk 6-10, errors, critical hazards |
| `info` | `#3B82F6` | Neutral navigation cues, non-safety data |

### Typography
| Scale | Font | Usage |
|-------|------|-------|
| Headings | Montserrat SemiBold/Bold/ExtraBold | Screen titles, HUD, section headers |
| Body | Roboto Regular/Medium/SemiBold | Descriptions, labels, UI text |
| Data | Roboto Mono Medium/SemiBold/Bold | Distances, times, risk scores, metrics |

### Spacing
- **Base unit:** 4px
- **Grid:** 8px increments
- **Screen padding:** 16px horizontal
- **Touch targets:** 44px minimum height

### Radii
| Element | Radius |
|---------|--------|
| Buttons, chips, FABs | `full` (pill) |
| Cards, sheets, modals | `xl` (16px) |
| Inputs | `md` (8px) |

### Motion
| Duration | Usage |
|----------|-------|
| `instant` (50ms) | Tap feedback |
| `fast` (150ms) | Hover, focus |
| `normal` (250ms) | Panel slides, card transitions |
| `slow` (400ms) | Modal open/close |
| `emphasis` (600ms) | Hazard alert entrance |

**Safety rule:** During active navigation, suppress all non-safety animations. Only hazard pulses, turn cues, and route color transitions may animate.

---

## Accessibility Requirements

### General
- WCAG AA contrast ratios minimum (4.5:1 body text, 3:1 large text/UI)
- All interactive elements have `accessibilityRole` and `accessibilityLabel`
- Live regions (`accessibilityLiveRegion="polite"`) for dynamic content updates

### Navigation Screens (Critical)
- **Large, high-contrast type** — maneuver instructions readable at arm's length
- **Monospace data** — distances and times are scannable, not decorative
- **Minimal visual noise** — only essential information during active navigation
- **Voice guidance** — optional TTS for hands-free operation
- **Reduced motion support** — respect system preferences via `useReducedMotion` hook

### Color Independence
- Safety states must be distinguishable without color alone (icons, labels, patterns)
- Risk distribution uses both color AND position (bar chart segments)

---

## Component Patterns

### Map-First Layout
Full-bleed map with floating overlays. Bottom sheet is collapsible via swipe. Fixed footer buttons stay visible when sheet collapses.

### Safety-Semantic Feedback
- Hazard alerts use amber border + icon + text label (not color alone)
- Route risk segments are color-coded AND labeled with score tooltips
- Confirmation actions (Yes/No) use green/red WITH text labels

### Gamification
- Badge unlocks: full-screen overlay with spring animation, particle burst, max 2 per session
- Streaks: non-punitive, 5 qualifying actions, freeze mechanic for grace
- Impact stats: CO2 saved, money saved, hazards reported — tangible, relatable units

### Haptic Feedback
- Light haptic on button press
- Medium haptic on successful action (route started, hazard reported)
- No haptics during active navigation (distraction risk)
