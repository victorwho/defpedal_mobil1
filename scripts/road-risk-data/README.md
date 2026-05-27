# scripts/road-risk-data

Loader for the `road_risk_data` PostGIS table in Supabase. Run these after
the risk-scoring engine on the OSRM box has produced ingestion-ready
GeoJSON parts. See `docs/runbooks/road-risk-data.md` for the full pipeline.

## Requirements

- Python 3.11+
- `pip install psycopg[binary] shapely`
- Network access to `db.<project_ref>.supabase.co:5432`
- The 8 part GeoJSON files at `$RISK_PARTS_DIR` (default:
  `C:/dev/OSRM_Server/risk4app`)

## Usage

```powershell
# PowerShell
$env:SUPABASE_DB_PW = '<password>'
$env:RISK_PARTS_DIR = 'C:\dev\OSRM_Server\risk4app'         # default
$env:RISK_STAGING_TABLE = 'road_risk_data_v23'              # default v22

python load_to_supabase.py    # ~17 min for 6M rows
python build_index.py         # ~1 min
```

```bash
# Git Bash / WSL
export SUPABASE_DB_PW='<password>'
export RISK_PARTS_DIR=/c/dev/OSRM_Server/risk4app

python load_to_supabase.py 2>&1 | tee load.log
python build_index.py 2>&1 | tee build_index.log
```

Then apply `swap.sql` (after substituting `<N>` and `<N-1>` markers) via
either Supabase SQL Editor or the Supabase MCP `apply_migration`.

## Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `SUPABASE_DB_PW` | yes | — | Postgres role password. Rotate after each interactive use. |
| `SUPABASE_PROJECT_REF` | no | `uobubaulcdcuggnetzei` | Target project. |
| `RISK_PARTS_DIR` | no | `C:/dev/OSRM_Server/risk4app` | Where the `road_risk_data.part*.geojson` files live. |
| `RISK_STAGING_TABLE` | no | `road_risk_data_v22` | Staging table name. Bump on each rebuild (v22, v23, ...). |

## Safety notes

- The loader TRUNCATEs the staging table at start, so re-running after a
  partial failure is safe. **It does NOT touch the live `road_risk_data`
  table** — the swap is a separate, explicit migration step.
- `statement_timeout` is disabled per-session for the load (Supabase's
  2-minute default would kill a multi-million-row COPY mid-stream).
- The DB password is never written to disk by these scripts. Pass it via
  env var, and rotate after each interactive use (`Dashboard → Database →
  Reset password`). Cloud Run uses the service-role JWT, not the DB
  password, so a rotation has zero production impact.
