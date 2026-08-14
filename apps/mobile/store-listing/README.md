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
├── es-ES/                     (mirror of en-US/, Spanish translation)
│   ├── title.txt
│   ├── short_description.txt
│   └── full_description.txt
└── README.md (this file)
```

`en-US` is the **default** listing language in Play Console. The app is
available across 31 European countries, and Play serves the default language
to every locale that has no dedicated translation — so the default has to be
the one that reads sensibly everywhere. `ro-RO` and `es-ES` are added as
translations for the two markets with street-by-street risk data and a fully
localized UI.

> **Migration note (2026-08-13):** this repo previously instructed setting
> `ro-RO` as the default, from when Romania was the only launch market. If the
> live console still has Romanian as the default, riders in Germany, Poland,
> France and everywhere else without a translation are being served a Romanian
> store page. **Verify the default in Play Console and flip it to
> `English (United States)`**, keeping `ro-RO` as a translation.

## How to use

1. In Play Console, go to **Grow → Store presence → Main store listing**.
2. Confirm the default language is `English (United States)` (see the migration
   note above). Paste the `en-US/*.txt` contents into the corresponding fields.
3. Click **Add language → Romanian (Romania)** and **→ Spanish (Spain)** to add
   the translations. Paste the `ro-RO/*.txt` and `es-ES/*.txt` contents.
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
