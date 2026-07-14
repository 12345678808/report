const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { deriveStatus, upsertEntry, upsertCustomColumnValue, getFullSnapshot } = require('../services/kpiStore');
const sheetsSync = require('../services/sheetsSync');

const router = express.Router();

// `from`/`to` together define the date range a report view is currently
// showing. Older callers that only ever knew about a single `date` still work
// (from=to=date) — a range is the general case, a single day is just the
// from===to special case of it.
function getRange(req) {
  const from = req.query.from || req.query.date || '2026-07-12';
  const to = req.query.to || req.query.date || from;
  return { from, to };
}

async function getCustomColumns() {
  const { rows } = await pool.query('SELECT id, name FROM custom_columns ORDER BY id');
  return rows;
}

// Sums each (kpi_item, custom_column) pair's values across the date range,
// scoped to one zone (or the common/org-wide bucket when zoneId is null) —
// same range-summing idea as the main target/achievement query below.
async function getCustomValuesByItem({ zoneId, from, to }) {
  const zoneClause = zoneId ? 'zone_id = $3' : 'zone_id IS NULL';
  const params = zoneId ? [from, to, zoneId] : [from, to];
  const { rows } = await pool.query(
    `SELECT kpi_item_id, custom_column_id, SUM(value) AS value
     FROM custom_column_values
     WHERE ${zoneClause} AND entry_date BETWEEN $1 AND $2
     GROUP BY kpi_item_id, custom_column_id`,
    params
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.kpi_item_id)) map.set(r.kpi_item_id, {});
    map.get(r.kpi_item_id)[r.custom_column_id] = r.value === null ? null : Number(r.value);
  }
  return map;
}

function rowToKpi(row, customColumns, customValuesByItem) {
  const { pending, performance, status } = deriveStatus(row.target, row.achievement);
  const customValues = {};
  const valuesForItem = customValuesByItem.get(row.kpi_item_id) || {};
  for (const col of customColumns) {
    customValues[col.id] = valuesForItem[col.id] ?? null;
  }
  return {
    kpiItemId: row.kpi_item_id,
    sno: row.sno,
    department: row.department,
    reportName: row.report_name,
    unit: row.unit,
    target: row.target === null ? null : Number(row.target),
    achievement: row.achievement === null ? null : Number(row.achievement),
    pending,
    performance,
    status,
    note: row.note || '',
    customValues,
  };
}

// all zones, in display order
router.get('/zones', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM zones ORDER BY id');
  res.json(rows);
});

// custom (admin-defined) extra metric columns
router.get('/columns', requireAuth, async (req, res) => {
  res.json(await getCustomColumns());
});

router.post('/columns', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'name is required.' });
  }
  try {
    const { rows } = await pool.query('INSERT INTO custom_columns (name) VALUES ($1) RETURNING id, name', [name.trim()]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A column with that name already exists.' });
    }
    console.error('POST /kpi/columns failed:', err.message);
    res.status(500).json({ error: 'Could not create the column.' });
  }
});

router.delete('/columns/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM custom_columns WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Column not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /kpi/columns/:id failed:', err.message);
    res.status(500).json({ error: 'Could not delete the column.' });
  }
});

// org-wide (common) KPI rows for a date range (from===to for a single day).
// Figures are SUMmed across every date in the range — a LEFT JOIN would only
// ever match one row per item for a single date, but for a genuine multi-day
// range each item can have several kpi_entries rows, so this always aggregates
// via GROUP BY (which degrades to "the one row" when the range is one day).
router.get('/common', requireAuth, async (req, res) => {
  const { from, to } = getRange(req);
  const { rows } = await pool.query(
    `SELECT ki.id AS kpi_item_id, ki.sno, ki.department, ki.report_name, ki.unit,
            SUM(ke.target) AS target, SUM(ke.achievement) AS achievement,
            CASE WHEN COUNT(ke.note) = 1 THEN MAX(ke.note) ELSE '' END AS note
     FROM kpi_items ki
     LEFT JOIN kpi_entries ke ON ke.kpi_item_id = ki.id AND ke.zone_id IS NULL AND ke.entry_date BETWEEN $1 AND $2
     WHERE ki.scope = 'common'
     GROUP BY ki.id, ki.sno, ki.department, ki.report_name, ki.unit
     ORDER BY ki.sno`,
    [from, to]
  );
  const customColumns = await getCustomColumns();
  const customValuesByItem = await getCustomValuesByItem({ zoneId: null, from, to });
  res.json(rows.map((r) => rowToKpi(r, customColumns, customValuesByItem)));
});

// zone-scoped KPI rows for a zone + date range — same range-SUM approach as /common.
router.get('/zone/:zoneId', requireAuth, async (req, res) => {
  const { from, to } = getRange(req);
  const { zoneId } = req.params;
  const { rows } = await pool.query(
    `SELECT ki.id AS kpi_item_id, ki.sno, ki.department, ki.report_name, ki.unit,
            SUM(ke.target) AS target, SUM(ke.achievement) AS achievement,
            CASE WHEN COUNT(ke.note) = 1 THEN MAX(ke.note) ELSE '' END AS note
     FROM kpi_items ki
     LEFT JOIN kpi_entries ke ON ke.kpi_item_id = ki.id AND ke.zone_id = $3 AND ke.entry_date BETWEEN $1 AND $2
     WHERE ki.scope = 'zone'
     GROUP BY ki.id, ki.sno, ki.department, ki.report_name, ki.unit
     ORDER BY ki.sno`,
    [from, to, zoneId]
  );
  const customColumns = await getCustomColumns();
  const customValuesByItem = await getCustomValuesByItem({ zoneId, from, to });
  res.json(rows.map((r) => rowToKpi(r, customColumns, customValuesByItem)));
});

const VALID_UNITS = ['Nos', 'MT', 'Rs'];

// Admin-only: define a brand-new KPI parameter (a new table row) that doesn't
// exist in the seeded catalog yet — e.g. a new report the department has
// started tracking. scope='zone' means every zone gets its own editable entry
// for this item (like Sanitation Workers' Attendance); scope='common' means a
// single org-wide figure (like the 4 existing Public Health rows).
//
// The new item is inserted right after the last existing row of the same
// department (same scope) so it lands in that department's heading group
// instead of at the very end of the table — everything at or after that sno
// shifts up by one to make room. Both the shift and the insert happen in one
// transaction so a crash mid-way can't leave two rows sharing an sno.
router.post('/items', requireAuth, requireAdmin, async (req, res) => {
  const { department, reportName, unit, scope } = req.body || {};
  if (!department?.trim() || !reportName?.trim() || !unit || !scope) {
    return res.status(400).json({ error: 'department, reportName, unit and scope are required.' });
  }
  if (!VALID_UNITS.includes(unit)) {
    return res.status(400).json({ error: `unit must be one of: ${VALID_UNITS.join(', ')}` });
  }
  if (!['common', 'zone'].includes(scope)) {
    return res.status(400).json({ error: "scope must be 'common' or 'zone'." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: deptRows } = await client.query(
      `SELECT MAX(sno) AS max_sno FROM kpi_items WHERE scope = $1 AND lower(department) = lower($2)`,
      [scope, department.trim()]
    );
    const { rows: scopeRows } = await client.query(`SELECT MAX(sno) AS max_sno FROM kpi_items WHERE scope = $1`, [scope]);
    const deptMaxSno = deptRows[0]?.max_sno;
    const scopeMaxSno = scopeRows[0]?.max_sno ?? 0;
    // If the department already has rows in this scope, insert right after them;
    // otherwise (a brand-new department name) just append at the end of the scope.
    const insertSno = (deptMaxSno ?? scopeMaxSno) + 1;

    // Shifting sno values up by one to make room can't be done as a single
    // `SET sno = sno + 1` pass: Postgres checks the UNIQUE(sno, scope) index
    // per row even within one UPDATE statement (it's not deferred to the end
    // of the statement), so e.g. row 17 moving to 18 collides with the
    // not-yet-updated row already sitting at 18. Negating first moves every
    // affected row out of the way into distinct, never-colliding negative
    // values, then the second pass restores them (+1) into the now-empty
    // slots — order-independent, so this is safe regardless of scan order.
    await client.query(`UPDATE kpi_items SET sno = -sno WHERE scope = $1 AND sno >= $2`, [scope, insertSno]);
    await client.query(`UPDATE kpi_items SET sno = -sno + 1 WHERE scope = $1 AND sno < 0`, [scope]);

    const { rows } = await client.query(
      `INSERT INTO kpi_items (sno, department, report_name, unit, scope)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, sno, department, report_name, unit, scope`,
      [insertSno, department.trim(), reportName.trim(), unit, scope]
    );

    await client.query('COMMIT');

    const item = rows[0];
    res.status(201).json({
      kpiItemId: item.id,
      sno: item.sno,
      department: item.department,
      reportName: item.report_name,
      unit: item.unit,
      scope: item.scope,
      target: null,
      achievement: null,
      pending: null,
      performance: null,
      status: null,
      note: '',
      customValues: {},
    });
  } catch (err) {
    await client.query('ROLLBACK');
    // Respond directly rather than re-throwing: this is Express 4, which does
    // NOT catch rejected promises from async handlers — an uncaught rejection
    // here would hang the request and, on newer Node defaults, crash the
    // whole process instead of just failing this one save.
    console.error('POST /kpi/items failed:', err.message);
    res.status(500).json({ error: 'Could not save the new KPI row.' });
  } finally {
    client.release();
  }
});

// Admin-only: permanently remove a KPI parameter (and, via ON DELETE CASCADE,
// every date/zone's logged figures and custom-column values for it). This is
// a hard delete with no undo — the client confirms with the admin before
// calling this.
router.delete('/items/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM kpi_items WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'KPI row not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /kpi/items/:id failed:', err.message);
    res.status(500).json({ error: 'Could not delete the row.' });
  }
});

// upsert a single day's target/achievement/note (+ any custom column values)
// for one KPI item (+ optional zone). Admin only — Commissioner is
// deliberately read-only, matching the original dashboard's role split.
router.put('/entry', requireAuth, requireAdmin, async (req, res) => {
  const { kpiItemId, zoneId, date, target, achievement, note, customValues } = req.body || {};
  if (!kpiItemId || !date) {
    return res.status(400).json({ error: 'kpiItemId and date are required.' });
  }
  const saved = await upsertEntry({ kpiItemId, zoneId, date, target, achievement, note });

  // Custom column values save alongside the main entry, one upsert per
  // column. A single column's value failing to save shouldn't fail the whole
  // row save — the target/achievement figures (the important part) are
  // already committed by upsertEntry above by the time this loop runs.
  const savedCustomValues = {};
  if (customValues && typeof customValues === 'object') {
    for (const [colIdStr, val] of Object.entries(customValues)) {
      const colId = Number(colIdStr);
      if (!Number.isFinite(colId)) continue;
      try {
        const savedVal = await upsertCustomColumnValue({ customColumnId: colId, kpiItemId, zoneId, date, value: val });
        savedCustomValues[colId] = savedVal.value;
      } catch (err) {
        console.error(`Custom column ${colId} value save failed:`, err.message);
      }
    }
  }

  res.json({ ...saved, customValues: savedCustomValues });

  // Best-effort push to Google Sheets, if configured — never let a Sheets
  // hiccup fail or delay the actual save, which is why this happens after
  // res.json() above rather than being awaited before responding.
  if (sheetsSync.isEnabled()) {
    try {
      const { rows } = await pool.query(
        `SELECT ki.department, ki.report_name, z.name AS zone_name
         FROM kpi_items ki
         LEFT JOIN zones z ON z.id = $2
         WHERE ki.id = $1`,
        [kpiItemId, zoneId || null]
      );
      const meta = rows[0];
      if (meta) {
        await sheetsSync.pushEntryToSheet({
          zone_name: meta.zone_name || 'Common',
          department: meta.department,
          report_name: meta.report_name,
          date,
          target: saved.target,
          achievement: saved.achievement,
          note: saved.note,
        });
      }
    } catch (err) {
      console.error('Sheets sync (push after save) failed:', err.message);
    }
  }
});

// Admin-only: rewrite the whole "KPI Data" tab from the database for one date.
// Use this once after setting up the Sheet, or any time you want the Sheet to
// forcibly match the database again (e.g. after bulk edits made outside the app).
router.post('/sheets/resync', requireAuth, requireAdmin, async (req, res) => {
  if (!sheetsSync.isEnabled()) {
    return res.status(400).json({ error: 'Google Sheets sync is not enabled (set GOOGLE_SHEETS_ENABLED=true in .env).' });
  }
  const date = req.body?.date || req.query.date || '2026-07-12';
  const rows = await getFullSnapshot(date);
  const result = await sheetsSync.pushFullSnapshot(date, rows);
  res.json(result);
});

module.exports = router;
