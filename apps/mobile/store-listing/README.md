# Play Console store listing — source of truth

Localized listing copy for **Defensive Pedal** on the Google Play Store. Checked
into the repo so Play Console uploads are reproducible and copy changes go
through PR review.

## Layout

```
store-listing/
├── en-US/
│   ├── title.txt              (Play limit: 30 graphemes)
│   ├── short_description.txt  (Play limit: 80 graphemes)
│   └── full_description.txt   (Play limit: 4000 graphemes)
├── ro-RO/                     (mirror of en-US/, Romanian translation)
│   ├── title.txt
│   ├── short_description.txt
│   └── full_description.txt
└── README.md (this file)
```

Romania is the launch country, so `ro-RO` is the **default** listing language
in Play Console. `en-US` is added as a translation for English-speaking
visitors and Play reviewers.

## How to use

1. In Play Console, go to **Grow → Store presence → Main store listing**.
2. Set default language to `Romanian (ro-RO)`. Paste the `ro-RO/*.txt` contents
   into the corresponding fields.
3. Click **Add language → English (United States)** to add a translation.
   Paste the `en-US/*.txt` contents.
4. Click **Save**. Submit a new release for changes to go live (listing-only
   changes still need a release submission).

## Verifying limits before commit

```bash
# Exact grapheme counts (handles diacritics like ț, ș, ă, î):
python3 -c "import sys, unicodedata; s=open(sys.argv[1]).read().rstrip(); print(len(s), 'graphemes')" en-US/title.txt
```

`wc -c` over-counts diacritics because they are multi-byte in UTF-8 — use
the grapheme counter above to match Play's enforcement.

## Editorial notes

- **Tone:** plain, concrete, second-person. No marketing-speak. The riff is
  "navigation that picks safer routes — not just the fastest", not
  "revolutionary" / "unleash" / "next-generation".
- **What to avoid:**
  - Comparing against named competitors by name (Play policy 2.10).
  - Health claims (CO₂ savings are an environmental claim, fine — but not
    "improves your fitness" or anything medical).
  - Inflated app-functionality claims that the Data Safety form contradicts.
- **What changes need re-review:** Play re-reviews the listing on every release
  if the listing was edited. Plan ~2-day rolling window when changing copy.

## When this file changes

- Whenever marketing copy is iterated, edit the `.txt` files here and open a
  PR. The PR description should preview the new EN copy so reviewers can read
  it without checking out.
- After approval and merge, paste into Play Console and submit a new release.
- Tag the commit with `listing-vN` if you want to track which version of the
  copy is currently live.

## Out-of-repo store-listing assets

These do not live in this directory because they are binary or large:

- **Feature graphic** (1024×500 PNG): `apps/mobile/assets/play/feature-graphic.png`
  *(TODO — create from brand kit)*.
- **App icon** (512×512 PNG): regenerated from the in-app SVG; see
  `apps/mobile/assets/icons/`.
- **Phone screenshots** (4–8 PNGs, 16:9 or 9:16): TODO — needs to be captured
  on a real device or controlled emulator. Suggested flow: planning → preview
  → navigation → impact → community.
