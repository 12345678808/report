const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { deriveStatus, upsertEntry, getFullSnapshot } = require('../services/kpiStore');
const sheetsSync = require('../services/sheetsSync');

const router = express.Router();

function rowToKpi(row) {
  const { pending, performance, status } = deriveStatus(row.target, row.achievement);
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
  };
}

// all zones, in display order
router.get('/zones', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM zones ORDER BY id');
  res.json(rows);
});

// org-wide (common) KPI rows for a given date (defaults to the one seeded date)
router.get('/common', requireAuth, async (req, res) => {
  const date = req.query.date || '2026-07-12';
  const { rows } = await pool.query(
    `SELECT ki.id AS kpi_item_id, ki.sno, ki.department, ki.report_name, ki.unit,
            ke.target, ke.achievement, ke.note
     FROM kpi_items ki
     LEFT JOIN kpi_entries ke ON ke.kpi_item_id = ki.id AND ke.zone_id IS NULL AND ke.entry_date = $1
     WHERE ki.scope = 'common'
     ORDER BY ki.sno`,
    [date]
  );
  res.json(rows.map(rowToKpi));
});

// zone-scoped KPI rows for a given zone + date
router.get('/zone/:zoneId', requireAuth, async (req, res) => {
  const date = req.query.date || '2026-07-12';
  const { zoneId } = req.params;
  const { rows } = await pool.query(
    `SELECT ki.id AS kpi_item_id, ki.sno, ki.department, ki.report_name, ki.unit,
            ke.target, ke.achievement, ke.note
     FROM kpi_items ki
     LEFT JOIN kpi_entries ke ON ke.kpi_item_id = ki.id AND ke.zone_id = $2 AND ke.entry_date = $1
     WHERE ki.scope = 'zone'
     ORDER BY ki.sno`,
    [date, zoneId]
  );
  res.json(rows.map(rowToKpi));
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

// upsert a single day's target/achievement/note for one KPI item (+ optional zone). Admin only —
// Commissioner is deliberately read-only, matching the original dashboard's role split.
router.put('/entry', requireAuth, requireAdmin, async (req, res) => {
  const { kpiItemId, zoneId, date, target, achievement, note } = req.body || {};
  if (!kpiItemId || !date) {
    return res.status(400).json({ error: 'kpiItemId and date are required.' });
  }
  const saved = await upsertEntry({ kpiItemId, zoneId, date, target, achievement, note });
  res.json(saved);

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