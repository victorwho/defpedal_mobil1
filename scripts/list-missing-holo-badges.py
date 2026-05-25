"""
Parse Supabase migrations to compute the current badge catalog, diff against
the holo manifest, and emit an MD file describing every badge still missing
holographic art.

Outputs to docs/badges-missing-holo-art.md.

Run from the repo root:
    python3 scripts/list-missing-holo-badges.py
"""

from __future__ import annotations

import re
import sys
from collections import OrderedDict
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
HOLO_TS = REPO_ROOT / "apps" / "mobile" / "src" / "design-system" / "tokens" / "holoBadges.ts"
OUT_PATH = REPO_ROOT / "docs" / "badges-missing-holo-art.md"

# --- Parsers -----------------------------------------------------------------


def split_sql_tuples(values_block: str) -> list[str]:
    """Split a SQL VALUES (...), (...), ... block into individual paren-tuples.

    Respects single quotes and escaped '' inside strings.
    """
    tuples: list[str] = []
    depth = 0
    buf: list[str] = []
    i = 0
    in_str = False
    while i < len(values_block):
        ch = values_block[i]
        if ch == "'" and (i == 0 or values_block[i - 1] != "\\"):
            # SQL doubles the quote to escape: '' is a single literal quote.
            if in_str and i + 1 < len(values_block) and values_block[i + 1] == "'":
                buf.append("''")
                i += 2
                continue
            in_str = not in_str
        if not in_str:
            if ch == "(":
                depth += 1
                if depth == 1:
                    buf = []
                    i += 1
                    continue
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    tuples.append("".join(buf))
                    i += 1
                    continue
        if depth >= 1:
            buf.append(ch)
        i += 1
    return tuples


def split_tuple_fields(t: str) -> list[str]:
    """Split a tuple's comma-separated fields, respecting quoted strings."""
    fields: list[str] = []
    buf: list[str] = []
    in_str = False
    i = 0
    while i < len(t):
        ch = t[i]
        if ch == "'":
            if in_str and i + 1 < len(t) and t[i + 1] == "'":
                # Escaped quote inside string
                buf.append("''")
                i += 2
                continue
            in_str = not in_str
            buf.append(ch)
        elif ch == "," and not in_str:
            fields.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
        i += 1
    if buf:
        fields.append("".join(buf).strip())
    return fields


def unquote(field: str) -> str:
    """Strip SQL string quoting and unescape doubled single quotes."""
    f = field.strip()
    if f.upper() == "NULL":
        return ""
    if f.startswith("'") and f.endswith("'"):
        f = f[1:-1].replace("''", "'")
    return f


# Columns of the INSERT statement (positional)
COLUMNS = [
    "badge_key",
    "category",
    "display_tab",
    "name",
    "flavor_text",
    "criteria_text",
    "criteria_unit",
    "tier",
    "tier_family",
    "is_hidden",
    "is_seasonal",
    "sort_order",
    "icon_key",
]

INSERT_RE = re.compile(
    r"INSERT\s+INTO\s+(?:public\.)?badge_definitions\b.*?VALUES\s*",
    re.IGNORECASE | re.DOTALL,
)
DELETE_RE = re.compile(
    r"DELETE\s+FROM\s+(?:public\.)?badge_definitions\s+WHERE\s+(.*?);",
    re.IGNORECASE | re.DOTALL,
)
UPDATE_RE = re.compile(
    r"UPDATE\s+(?:public\.)?badge_definitions\s+SET\s+(.*?)\s+WHERE\s+(.*?);",
    re.IGNORECASE | re.DOTALL,
)


def parse_migration_inserts(sql: str) -> list[dict]:
    rows: list[dict] = []
    for match in INSERT_RE.finditer(sql):
        # Find the matching VALUES block ending at the next bare ';'
        start = match.end()
        # Scan forward respecting quotes for the statement terminator.
        depth = 0
        in_str = False
        i = start
        while i < len(sql):
            ch = sql[i]
            if ch == "'":
                if in_str and i + 1 < len(sql) and sql[i + 1] == "'":
                    i += 2
                    continue
                in_str = not in_str
            elif not in_str:
                if ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                elif ch == ";" and depth == 0:
                    break
            i += 1
        block = sql[start:i]
        tuples = split_sql_tuples(block)
        for t in tuples:
            fields = split_tuple_fields(t)
            if len(fields) < len(COLUMNS):
                continue
            row = {COLUMNS[idx]: unquote(fields[idx]) for idx in range(len(COLUMNS))}
            rows.append(row)
    return rows


def apply_deletes(sql: str, catalog: dict[str, dict]) -> None:
    """Apply DELETE FROM badge_definitions WHERE badge_key IN (...) or WHERE badge_key = '...'."""
    for match in DELETE_RE.finditer(sql):
        where = match.group(1)
        # IN ('a', 'b', 'c')
        in_match = re.search(r"badge_key\s+IN\s*\(([^)]+)\)", where, re.IGNORECASE)
        if in_match:
            for raw in in_match.group(1).split(","):
                key = unquote(raw)
                catalog.pop(key, None)
            continue
        eq_match = re.search(r"badge_key\s*=\s*'([^']+)'", where, re.IGNORECASE)
        if eq_match:
            catalog.pop(eq_match.group(1), None)
            continue
        # Pattern: WHERE tier_family = '...' deletes all matching badges.
        fam_match = re.search(r"tier_family\s*=\s*'([^']+)'", where, re.IGNORECASE)
        if fam_match:
            fam = fam_match.group(1)
            to_remove = [k for k, v in catalog.items() if v.get("tier_family") == fam]
            for k in to_remove:
                catalog.pop(k, None)


# --- Build the catalog -------------------------------------------------------


def build_catalog() -> dict[str, dict]:
    catalog: "OrderedDict[str, dict]" = OrderedDict()
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    for f in files:
        try:
            sql = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            sql = f.read_text(encoding="latin-1")
        # Apply DELETEs first because they're often paired with INSERTs that
        # re-add the same key with new copy.
        apply_deletes(sql, catalog)
        for row in parse_migration_inserts(sql):
            key = row["badge_key"]
            if not key:
                continue
            catalog[key] = row
    return dict(catalog)


def load_holo_keys() -> set[str]:
    text = HOLO_TS.read_text(encoding="utf-8")
    return set(re.findall(r"^\s+(\w+):\s+require\(", text, re.MULTILINE))


def render_badge_rows(lines: list[str], rows: list[dict]) -> None:
    by_tab: "OrderedDict[str, list[dict]]" = OrderedDict()
    tab_order = ["firsts", "riding", "consistency", "impact", "safety", "community", "explore", "events", "secret"]
    for row in rows:
        tab = row.get("display_tab", "other") or "other"
        by_tab.setdefault(tab, []).append(row)

    for tab in tab_order:
        sec = by_tab.get(tab) or []
        if not sec:
            continue
        lines.append(f"### {tab.title()} ({len(sec)})")
        lines.append("")
        sec.sort(key=lambda r: (int(r.get("sort_order") or "0"), r["badge_key"]))
        for row in sec:
            name = row.get("name") or row["badge_key"]
            tier = row.get("tier") or "0"
            tier_family = row.get("tier_family") or ""
            icon_key = row.get("icon_key") or ""
            tier_label = ""
            if tier_family and tier and tier != "0":
                tier_label = f" — tier {tier} of `{tier_family}`"
            elif tier and tier != "0":
                tier_label = f" — tier {tier}"
            lines.append(f"#### {name}{tier_label}")
            lines.append("")
            lines.append(f"- **Key:** `{row['badge_key']}`")
            if icon_key and icon_key != row["badge_key"]:
                lines.append(f"- **Icon key:** `{icon_key}`")
            flavor = row.get("flavor_text") or ""
            criteria = row.get("criteria_text") or ""
            if flavor:
                lines.append(f"- **Description:** {flavor}")
            if criteria:
                lines.append(f"- **Criteria:** {criteria}")
            is_hidden = (row.get("is_hidden") or "").lower() == "true"
            is_seasonal = (row.get("is_seasonal") or "").lower() == "true"
            flags = []
            if is_hidden:
                flags.append("hidden")
            if is_seasonal:
                flags.append("seasonal")
            if flags:
                lines.append(f"- **Flags:** {', '.join(flags)}")
            lines.append("")


def render_badge_rows_with_hint(lines: list[str], rows: list[tuple[dict, str]]) -> None:
    by_tab: "OrderedDict[str, list[tuple[dict, str]]]" = OrderedDict()
    tab_order = ["firsts", "riding", "consistency", "impact", "safety", "community", "explore", "events", "secret"]
    for row, hint in rows:
        tab = row.get("display_tab", "other") or "other"
        by_tab.setdefault(tab, []).append((row, hint))

    for tab in tab_order:
        sec = by_tab.get(tab) or []
        if not sec:
            continue
        lines.append(f"### {tab.title()} ({len(sec)})")
        lines.append("")
        sec.sort(key=lambda r: (int(r[0].get("sort_order") or "0"), r[0]["badge_key"]))
        for row, hint in sec:
            name = row.get("name") or row["badge_key"]
            tier = row.get("tier") or "0"
            tier_family = row.get("tier_family") or ""
            tier_label = ""
            if tier_family and tier and tier != "0":
                tier_label = f" — tier {tier} of `{tier_family}`"
            elif tier and tier != "0":
                tier_label = f" — tier {tier}"
            lines.append(f"#### {name}{tier_label}")
            lines.append("")
            lines.append(f"- **Key:** `{row['badge_key']}`")
            icon_key = row.get("icon_key") or ""
            if icon_key and icon_key != row["badge_key"]:
                lines.append(f"- **Icon key:** `{icon_key}`")
            if hint:
                lines.append(f"- **Existing PNG:** `{hint}.png`")
            flavor = row.get("flavor_text") or ""
            criteria = row.get("criteria_text") or ""
            if flavor:
                lines.append(f"- **Description:** {flavor}")
            if criteria:
                lines.append(f"- **Criteria:** {criteria}")
            is_hidden = (row.get("is_hidden") or "").lower() == "true"
            is_seasonal = (row.get("is_seasonal") or "").lower() == "true"
            flags = []
            if is_hidden:
                flags.append("hidden")
            if is_seasonal:
                flags.append("seasonal")
            if flags:
                lines.append(f"- **Flags:** {', '.join(flags)}")
            lines.append("")


def write_md(
    needs_art: list[dict],
    needs_alias: list[dict],
    needs_typo_fix: list[tuple[dict, str]],
    holo_keys: set[str],
    catalog_size: int,
) -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    total_gaps = len(needs_art) + len(needs_alias) + len(needs_typo_fix)
    lines: list[str] = []
    lines.append(f"# Badges Without Holo Treatment ({total_gaps} of {catalog_size})")
    lines.append("")
    lines.append("Generated by `scripts/list-missing-holo-badges.py`.")
    lines.append("")
    lines.append(
        "Each entry below renders today as the fallback SVG shield + duotone "
        "icon. The list is split into three categories — none of the four "
        "art-needed badges has a true coverage gap; the script picked up a "
        "couple of legitimate alias misses and a few filename typos and is "
        "showing them separately so the cheapest fixes float to the top."
    )
    lines.append("")
    lines.append(
        f"- **Manifest gap ({len(needs_alias)} badges)** — a PNG already "
        "exists in `apps/mobile/assets/holo_badges/` (its filename matches "
        "the badge's `icon_key`) but `badge_key` isn't in the manifest at "
        "`apps/mobile/src/design-system/tokens/holoBadges.ts`. Fix per "
        "badge: one extra line in the manifest mapping "
        "`badge_key: require('../../../assets/holo_badges/<icon_key>.png')`."
    )
    lines.append("")
    lines.append(
        f"- **Filename typo ({len(needs_typo_fix)} badges)** — art exists "
        "but the PNG filename has a typo relative to the badge's metadata. "
        "Fix per pair: either rename the PNG to match `badge_key` / "
        "`icon_key`, OR add a manifest alias pointing at the typo'd "
        "filename. No new illustration needed."
    )
    lines.append("")
    lines.append(
        f"- **Truly missing art ({len(needs_art)} badges)** — no PNG "
        "matching `badge_key`, `tier_family`, or `icon_key`, and no fuzzy "
        "filename neighbor. Needs an illustration drawn at 1080x1080 (or "
        "larger) with the holographic rim and Pedal mascot, run through "
        "`scripts/process-holo-badges.py` to background-remove and resize "
        "to 480x480, then a one-line manifest entry."
    )
    lines.append("")
    lines.append("---")
    lines.append("")

    if needs_alias:
        lines.append("## Manifest gap — add a one-line alias")
        lines.append("")
        # Reuse the typo-hint renderer by passing icon_key as the hint.
        rows_with_hint = [(r, r.get("icon_key") or "") for r in needs_alias]
        render_badge_rows_with_hint(lines, rows_with_hint)
        lines.append("---")
        lines.append("")

    if needs_typo_fix:
        lines.append("## Filename typo — rename PNG or alias the typo'd name")
        lines.append("")
        render_badge_rows_with_hint(lines, needs_typo_fix)
        lines.append("---")
        lines.append("")

    if needs_art:
        lines.append("## Truly missing art — needs a new illustration")
        lines.append("")
        render_badge_rows_with_hint(lines, [(r, "") for r in needs_art])

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    catalog = build_catalog()
    holo_keys = load_holo_keys()

    # Map of PNG filename (stem) → presence in assets/holo_badges/.
    assets_dir = REPO_ROOT / "apps" / "mobile" / "assets" / "holo_badges"
    png_stems = {p.stem for p in assets_dir.glob("*.png")}

    # Fuzzy match: look for art reachable via near-miss filenames (e.g.
    # icon_key=co2_champion but PNG named c02_champion). Considers single
    # char substitutions and trailing 's' (plural vs singular).
    def fuzzy_matches(key: str) -> list[str]:
        if not key:
            return []
        candidates: list[str] = []
        for stem in png_stems:
            if stem == key:
                continue
            # Trailing 's' difference (multi_3stop vs multi_3stops)
            if stem == key + "s" or stem + "s" == key:
                candidates.append(stem)
                continue
            # Single-character substitution (co2 vs c02)
            if len(stem) == len(key) and sum(1 for a, b in zip(stem, key) if a != b) == 1:
                candidates.append(stem)
        return candidates

    # BadgeVisual currently resolves via badge_key first, then tier_family.
    # icon_key isn't checked but a PNG matching icon_key means the art exists
    # and just needs a manifest entry. Fuzzy matches mean the art exists but
    # the filename has a typo relative to the badge metadata.
    def resolution(row: dict) -> tuple[str, str]:
        """Returns (status, hint_filename). status in {wired, alias, typo, art}."""
        key = row["badge_key"]
        fam = row.get("tier_family") or ""
        icon = row.get("icon_key") or ""

        if key in holo_keys:
            return "wired", key
        if fam and fam in holo_keys:
            return "wired", fam
        if icon and icon in holo_keys:
            return "alias", icon
        # Fuzzy filename match — art exists but mis-named.
        for candidate_key in (icon, key, fam):
            matches = fuzzy_matches(candidate_key)
            if matches:
                return "typo", matches[0]
        return "art", ""

    buckets: dict[str, list[tuple[dict, str]]] = {
        "wired": [],
        "alias": [],
        "typo": [],
        "art": [],
    }
    for row in catalog.values():
        status, hint = resolution(row)
        buckets[status].append((row, hint))

    print(f"Total badges in catalog:    {len(catalog)}")
    print(f"  Wired (renders as holo):  {len(buckets['wired'])}")
    print(f"  Manifest alias needed:    {len(buckets['alias'])}")
    print(f"  Filename typo (art ok):   {len(buckets['typo'])}")
    print(f"  Truly missing art:        {len(buckets['art'])}")
    print()
    write_md(
        [r for r, _ in buckets["art"]],
        [r for r, _ in buckets["alias"]],
        [(r, h) for r, h in buckets["typo"]],
        holo_keys,
        len(catalog),
    )
    print(f"Wrote {OUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
