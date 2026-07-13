-- ICCC Daily Report Card — core schema
-- Run via `npm run migrate` (see migrate.js)

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'commissioner')),
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zones (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- catalog of the KPI parameters CCMC tracks (department + report name + unit).
-- scope='common' = a single org-wide figure (no zone breakdown).
-- scope='zone'    = tracked separately per zone.
CREATE TABLE IF NOT EXISTS kpi_items (
  id          SERIAL PRIMARY KEY,
  sno         INTEGER NOT NULL,
  department  TEXT NOT NULL,
  report_name TEXT NOT NULL,
  unit        TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('common', 'zone')),
  UNIQUE (sno, scope)
);

-- the actual day-by-day logged figures. zone_id is NULL for common (org-wide) items.
-- target/achievement/pending/performance/status are derived at query time, not stored,
-- so there's a single source of truth and no risk of them drifting out of sync.
CREATE TABLE IF NOT EXISTS kpi_entries (
  id           SERIAL PRIMARY KEY,
  kpi_item_id  INTEGER NOT NULL REFERENCES kpi_items(id) ON DELETE CASCADE,
  zone_id      INTEGER REFERENCES zones(id) ON DELETE CASCADE,
  entry_date   DATE NOT NULL,
  target       NUMERIC,
  achievement  NUMERIC,
  note         TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTE: a plain UNIQUE(kpi_item_id, zone_id, entry_date) does NOT work as an upsert target
-- for common (org-wide) rows, because zone_id is NULL there and Postgres treats every NULL
-- as distinct from every other NULL under a standard unique constraint — so ON CONFLICT
-- would never fire and each "edit" would silently insert a brand-new duplicate row instead
-- of updating the existing one. Two partial unique indexes fix this: zone-scoped rows are
-- deduped on (kpi_item_id, zone_id, entry_date) where zone_id IS NOT NULL, and common rows
-- are deduped on (kpi_item_id, entry_date) where zone_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_entries_zone
  ON kpi_entries (kpi_item_id, zone_id, entry_date) WHERE zone_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_entries_common
  ON kpi_entries (kpi_item_id, entry_date) WHERE zone_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_entries_date ON kpi_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_kpi_entries_item ON kpi_entries(kpi_item_id);
