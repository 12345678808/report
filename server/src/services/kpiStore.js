// Shared KPI read/derive/upsert logic. Used by both the normal REST route
// (PUT /api/kpi/entry, driven by the React app) and the Google Sheets webhook
// (POST /api/sheets/webhook, driven by an edit made directly in the Sheet) —
// so there is exactly one code path that writes to kpi_entries, and both
// entry points get the same validation, the same conflict-safe upsert, and
// the same derived pending/performance/status math.

const { pool } = require('../db');

function deriveStatus(target, achievement) {
  const pending = target != null && achievement != null ? Number(target) - Number(achievement) : null;
  const performance =
    target != null && Number(target) > 0 && achievement != null ? Number(achievement) / Number(target) : null;
  let status = null;
  if (performance != null) {
    const pct = performance * 100;
    // Tier thresholds: 99%+ = Ok/Completed (yellow), 90-98.99% = Medium (green),
    // below 90% = Low (red).
    status = pct >= 99 ? 'Ok' : pct >= 90 ? 'Medium' : 'Low';
  }
  return { pending, performance, status };
}

// Upsert one day's figures for one KPI item (+ optional zone).
//
// NOTE ON THE ON CONFLICT TARGET: kpi_entries has two separate partial unique
// indexes (see schema.sql) — one for zone-scoped rows, one for common
// (zone_id IS NULL) rows — because a plain UNIQUE constraint can't be used as
// an upsert target when the differentiating column (zone_id) is NULL:
// Postgres treats every NULL as distinct from every other NULL, so ON
// CONFLICT would silently never fire for common rows and every "edit" would
// insert a brand-new duplicate instead of updating the existing one. We pick
// the matching index here based on whether this entry is zone-scoped.
async function upsertEntry({ kpiItemId, zoneId, date, target, achievement, note }) {
  const normalizedZoneId = zoneId || null;
  const conflictClause = normalizedZoneId
    ? 'ON CONFLICT (kpi_item_id, zone_id, entry_date) WHERE zone_id IS NOT NULL'
    : 'ON CONFLICT (kpi_item_id, entry_date) WHERE zone_id IS NULL';
  const { rows } = await pool.query(
    `INSERT INTO kpi_entries (kpi_item_id, zone_id, entry_date, target, achievement, note, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ${conflictClause}
     DO UPDATE SET target = EXCLUDED.target, achievement = EXCLUDED.achievement,
                   note = EXCLUDED.note, updated_at = now()
     RETURNING *`,
    [kpiItemId, normalizedZoneId, date, target ?? null, achievement ?? null, note || '']
  );
  const saved = rows[0];
  const { pending, performance, status } = deriveStatus(saved.target, saved.achievement);
  return {
    kpiItemId: saved.kpi_item_id,
    zoneId: saved.zone_id,
    date: saved.entry_date,
    target: saved.target === null ? null : Number(saved.target),
    achievement: saved.achievement === null ? null : Number(saved.achievement),
    pending,
    performance,
    status,
    note: saved.note || '',
    updatedAt: saved.updated_at,
  };
}

// Upsert one day's value for one (custom column, kpi item, + optional zone) —
// same conflict-target trick as upsertEntry, for the same NULL-zone_id reason.
async function upsertCustomColumnValue({ customColumnId, kpiItemId, zoneId, date, value }) {
  const normalizedZoneId = zoneId || null;
  const conflictClause = normalizedZoneId
    ? 'ON CONFLICT (custom_column_id, kpi_item_id, zone_id, entry_date) WHERE zone_id IS NOT NULL'
    : 'ON CONFLICT (custom_column_id, kpi_item_id, entry_date) WHERE zone_id IS NULL';
  const { rows } = await pool.query(
    `INSERT INTO custom_column_values (custom_column_id, kpi_item_id, zone_id, entry_date, value, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ${conflictClause}
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     RETURNING *`,
    [customColumnId, kpiItemId, normalizedZoneId, date, value ?? null]
  );
  const saved = rows[0];
  return {
    customColumnId: saved.custom_column_id,
    kpiItemId: saved.kpi_item_id,
    zoneId: saved.zone_id,
    date: saved.entry_date,
    value: saved.value === null ? null : Number(saved.value),
  };
}

// Look up a kpi_item_id by (department, report_name) — case-insensitive, since
// a human typing into a spreadsheet won't always match casing exactly.
// scope, if given, narrows to 'common' or 'zone' (a department name is not
// guaranteed unique across both catalogs).
async function findKpiItemId({ department, reportName, scope }) {
  const params = [department, reportName];
  let query = `SELECT id FROM kpi_items WHERE lower(department) = lower($1) AND lower(report_name) = lower($2)`;
  if (scope) {
    params.push(scope);
    query += ` AND scope = $3`;
  }
  const { rows } = await pool.query(query, params);
  return rows[0] ? rows[0].id : null;
}

// Look up a zone_id by name — case-insensitive. Returns null for "Common"
// (or any falsy input), meaning the org-wide row.
async function findZoneId(zoneName) {
  if (!zoneName || /^common$/i.test(zoneName.trim())) return null;
  const { rows } = await pool.query('SELECT id FROM zones WHERE lower(name) = lower($1)', [zoneName.trim()]);
  return rows[0] ? rows[0].id : null;
}

// Full catalog + entries for one date, common and zone items together — used
// to build the "push everything to the Sheet" snapshot. Common items produce
// one row each (zone_name = 'Common'); zone items are cross-joined against
// every zone so each (item, zone) pair gets its own row, matching how the
// Sheet is laid out (one line per item per zone).
async function getFullSnapshot(date) {
  const { rows } = await pool.query(
    `SELECT ki.id AS kpi_item_id, ki.department, ki.report_name, ki.unit, ki.scope, ki.sno,
            'Common' AS zone_name, ke.target, ke.achievement, ke.note
     FROM kpi_items ki
     LEFT JOIN kpi_entries ke ON ke.kpi_item_id = ki.id AND ke.zone_id IS NULL AND ke.entry_date = $1
     WHERE ki.scope = 'common'

     UNION ALL

     SELECT ki.id AS kpi_item_id, ki.department, ki.report_name, ki.unit, ki.scope, ki.sno,
            z.name AS zone_name, ke.target, ke.achievement, ke.note
     FROM kpi_items ki
     CROSS JOIN zones z
     LEFT JOIN kpi_entries ke ON ke.kpi_item_id = ki.id AND ke.zone_id = z.id AND ke.entry_date = $1
     WHERE ki.scope = 'zone'

     ORDER BY scope, zone_name, sno`,
    [date]
  );
  return rows;
}

module.exports = { deriveStatus, upsertEntry, upsertCustomColumnValue, findKpiItemId, findZoneId, getFullSnapshot };
