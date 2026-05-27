"""
Build the GiST spatial index on the road_risk_data staging table and run
VACUUM ANALYZE. Both operations need an unbounded session timeout (default
is 2 min) and VACUUM must run outside an explicit transaction.

Configuration (environment variables):
  SUPABASE_DB_PW          (required) — Postgres role password
  SUPABASE_PROJECT_REF    (default: uobubaulcdcuggnetzei)
  RISK_STAGING_TABLE      (default: road_risk_data_v22)

See `docs/runbooks/road-risk-data.md` for the full pipeline context.
"""
from __future__ import annotations

import os
import sys
import time
import urllib.parse

import psycopg

sys.stdout.reconfigure(encoding="utf-8")

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "uobubaulcdcuggnetzei")
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
INDEX_NAME = f"{STAGING_TABLE}_geom_idx"


def main() -> int:
    print(f"Building GiST on {STAGING_TABLE}.geom + VACUUM ANALYZE", flush=True)
    print(f"  Project ref: {PROJECT_REF}", flush=True)

    with psycopg.connect(URL, connect_timeout=30, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            cur.execute("SHOW statement_timeout")
            print(f"  statement_timeout: {cur.fetchone()[0]}", flush=True)

            t0 = time.time()
            print(f"Creating {INDEX_NAME} ...", flush=True)
            cur.execute(
                f"CREATE INDEX IF NOT EXISTS {INDEX_NAME} "
                f"ON public.{STAGING_TABLE} USING GIST (geom)"
            )
            print(f"  index built in {time.time() - t0:.1f}s", flush=True)

            t0 = time.time()
            print(f"VACUUM ANALYZE {STAGING_TABLE} ...", flush=True)
            cur.execute(f"VACUUM ANALYZE public.{STAGING_TABLE}")
            print(f"  vacuum analyze done in {time.time() - t0:.1f}s", flush=True)

            cur.execute(
                f"SELECT "
                f"pg_size_pretty(pg_total_relation_size('{STAGING_TABLE}')), "
                f"pg_size_pretty(pg_relation_size('{STAGING_TABLE}')), "
                f"pg_size_pretty(pg_indexes_size('{STAGING_TABLE}'))"
            )
            total, heap, indexes = cur.fetchone()
            print(f"  total={total}  heap={heap}  indexes={indexes}", flush=True)

            # Confirm the index is picked up by a sample ST_DWithin query
            cur.execute(
                f"EXPLAIN ANALYZE "
                f"SELECT id, risk_score "
                f"FROM {STAGING_TABLE} "
                f"WHERE ST_DWithin("
                f"  geom, "
                f"  ST_SetSRID(ST_MakePoint(26.0959, 44.4660), 4326), "
                f"  0.0002) "
                f"ORDER BY ST_Distance(geom, ST_SetSRID(ST_MakePoint(26.0959, 44.4660), 4326)) "
                f"LIMIT 1"
            )
            print("\nEXPLAIN for nearest-neighbor query (Bucharest centre):", flush=True)
            for row in cur.fetchall():
                print(f"  {row[0]}", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
