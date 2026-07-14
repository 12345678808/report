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

-- Admin-defined extra metric columns, layered on top of the fixed
-- Target/Achievement/Pending/Performance/Status set (those stay fixed in code
-- since deriveStatus's formula depends on exactly those two stored numbers).
-- A custom column applies uniformly across every row/zone/date — e.g. an
-- admin could add "Budget Allocated" and every KPI row gets an editable cell
-- for it, same as target/achievement.
CREATE TABLE IF NOT EXISTS custom_columns (
  id         SERIAL PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One value per (custom column, kpi item, zone, date) — mirrors kpi_entries'
-- shape (zone_id NULL = common/org-wide) so the same date-range SUM and
-- zone_id-NULL upsert conventions apply here too.
CREATE TABLE IF NOT EXISTS custom_column_values (
  id               SERIAL PRIMARY KEY,
  custom_column_id INTEGER NOT NULL REFERENCES custom_columns(id) ON DELETE CASCADE,
  kpi_item_id      INTEGER NOT NULL REFERENCES kpi_items(id) ON DELETE CASCADE,
  zone_id          INTEGER REFERENCES zones(id) ON DELETE CASCADE,
  entry_date       DATE NOT NULL,
  value            NUMERIC,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_col_values_zone
  ON custom_column_values (custom_column_id, kpi_item_id, zone_id, entry_date) WHERE zone_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_col_values_common
  ON custom_column_values (custom_column_id, kpi_item_id, entry_date) WHERE zone_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_custom_col_values_col ON custom_column_values(custom_column_id);
