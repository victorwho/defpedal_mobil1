"""
Bulk-load a staging copy of road_risk_data into Supabase PostGIS via
psycopg COPY FROM STDIN with EWKB hex geometry.

Reads each part GeoJSON file line-by-line (one Feature per line, the
FeatureCollection envelope on the first + last lines), converts each
geometry to EWKB hex with SRID 4326 via shapely, and streams rows into
the staging table via a per-file COPY transaction.

Per-file commit (one transaction per part file). If a file fails
mid-stream the transaction rolls back; the file can be re-run after a
TRUNCATE of the staging table.

Configuration (environment variables):
  SUPABASE_DB_PW          (required) — Postgres role password
  SUPABASE_PROJECT_REF    (default: uobubaulcdcuggnetzei)
  RISK_PARTS_DIR          (default: C:/dev/OSRM_Server/risk4app)
  RISK_STAGING_TABLE      (default: road_risk_data_v22)

Run:
  $env:SUPABASE_DB_PW = '...'      # PowerShell, or export in bash
  python load_to_supabase.py

Logs are sent to stdout, UTF-8 encoded. Caller should redirect to a
file for long-running runs.

See `docs/runbooks/road-risk-data.md` for the full pipeline context.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
from pathlib import Path

import psycopg
import shapely
from shapely.geometry import shape

# Force UTF-8 stdout so Romanian/Spanish names don't crash the console
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "uobubaulcdcuggnetzei")
PARTS_DIR = Path(os.environ.get("RISK_PARTS_DIR", "C:/dev/OSRM_Server/risk4app"))
STAGING_TABLE = os.environ.get("RISK_STAGING_TABLE", "road_risk_data_v22")

try:
    PW = urllib.parse.quote_plus(os.environ["SUPABASE_DB_PW"])
except KeyError:
    sys.stderr.write("ERROR: SUPABASE_DB_PW env var is required\n")
    sys.exit(1)

URL = (
    f"postgresql://postgres:{PW}@db.{PROJECT_REF}.supabase.co"
    f":5432/postgres?sslmode=require"
)

PART_FILES = sorted(PARTS_DIR.glob("road_risk_data.part*.geojson"))

COPY_SQL = (
    f"COPY {STAGING_TABLE} "
    "(name, highway, raw_risk, way_id, is_urban, risk_factors, risk_score, geom) "
    "FROM STDIN"
)


def feature_to_row(feat: dict) -> tuple | None:
    """Convert one GeoJSON Feature dict to a row tuple, or None to skip."""
    p = feat.get("properties") or {}
    score = p.get("risk_score")
    if score is None:
        return None
    try:
        score_f = float(score)
    except (TypeError, ValueError):
        return None
    if score_f <= 0:  # schema reserves exactly 0 for "no data"
        return None

    geom_json = feat.get("geometry")
    if not geom_json:
        return None
    geom = shape(geom_json)
    geom = shapely.set_srid(geom, 4326)
    ewkb_hex = shapely.to_wkb(geom, hex=True, include_srid=True)

    rf = p.get("risk_factors")
    return (
        p.get("name"),
        p.get("highway"),
        p.get("raw_risk"),
        p.get("way_id"),
        p.get("is_urban"),
        json.dumps(rf, ensure_ascii=False) if rf is not None else None,
        score_f,
        ewkb_hex,
    )


def stream_features(path: Path):
    """Yield Feature dicts from a one-feature-per-line GeoJSON file."""
    with open(path, "r", encoding="utf-8") as fh:
        first = fh.readline()
        if "FeatureCollection" not in first:
            raise RuntimeError(f"{path.name}: unexpected first line: {first[:80]!r}")
        for line in fh:
            line = line.rstrip("\r\n")
            if not line or line in ("]}", "]", "}"):
                continue
            if line.endswith(","):
                line = line[:-1]
            if not line.startswith("{"):
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                print(f"  WARN: skipping malformed line in {path.name}: {e}")
                continue


def load_file(conn: psycopg.Connection, path: Path) -> tuple[int, int]:
    """Stream-load one file. Returns (inserted, skipped)."""
    inserted = 0
    skipped = 0
    last_report = time.time()
    t0 = time.time()

    with conn.cursor() as cur:
        with cur.copy(COPY_SQL) as copy:
            for feat in stream_features(path):
                row = feature_to_row(feat)
                if row is None:
                    skipped += 1
                    continue
                copy.write_row(row)
                inserted += 1
                if inserted % 50000 == 0:
                    now = time.time()
                    rate = 50000 / (now - last_report) if now > last_report else 0
                    elapsed = now - t0
                    print(
                        f"  {path.name}: {inserted:>8,} rows  "
                        f"({rate:,.0f} rows/sec, file elapsed {elapsed:.0f}s)",
                        flush=True,
                    )
                    last_report = now

    conn.commit()
    return inserted, skipped


def main() -> int:
    if not PART_FILES:
        print(f"ERROR: no part files found in {PARTS_DIR}", flush=True)
        return 1

    print(f"Loader starting: {len(PART_FILES)} part files", flush=True)
    print(f"  Project ref:    {PROJECT_REF}", flush=True)
    print(f"  Staging table:  {STAGING_TABLE}", flush=True)
    print(f"  Parts dir:      {PARTS_DIR}", flush=True)

    grand_t0 = time.time()
    total_inserted = 0
    total_skipped = 0

    with psycopg.connect(URL, connect_timeout=30) as conn:
        # Disable the default 2-min statement_timeout for this session so
        # multi-million-row COPY operations aren't killed mid-stream.
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute("SET idle_in_transaction_session_timeout = 0")
            cur.execute("SHOW statement_timeout")
            print(f"  statement_timeout: {cur.fetchone()[0]}", flush=True)
            # Ensure we start with a clean staging table
            cur.execute(f"TRUNCATE {STAGING_TABLE} RESTART IDENTITY")
            conn.commit()
        print(f"Pre-truncate of {STAGING_TABLE} complete", flush=True)

        for idx, path in enumerate(PART_FILES, start=1):
            print(
                f"\n[{idx}/{len(PART_FILES)}] Loading {path.name} "
                f"({path.stat().st_size / 1024 / 1024:.0f} MB)...",
                flush=True,
            )
            file_t0 = time.time()
            try:
                ins, skp = load_file(conn, path)
            except Exception as e:
                print(f"ERROR loading {path.name}: {type(e).__name__}: {e}", flush=True)
                conn.rollback()
                return 2
            total_inserted += ins
            total_skipped += skp
            file_dt = time.time() - file_t0
            print(
                f"  {path.name} done: inserted={ins:,} skipped={skp:,} "
                f"in {file_dt:.1f}s ({ins / max(file_dt, 0.001):,.0f} rows/sec)",
                flush=True,
            )

        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {STAGING_TABLE}")
            db_count = cur.fetchone()[0]

    total_dt = time.time() - grand_t0
    print("\n" + "=" * 60, flush=True)
    print(f"DONE in {total_dt:.0f}s ({total_dt / 60:.1f} min)", flush=True)
    print(f"  inserted (client-side): {total_inserted:,}", flush=True)
    print(f"  skipped  (client-side): {total_skipped:,}", flush=True)
    print(f"  row count (DB):         {db_count:,}", flush=True)
    print("=" * 60, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
