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
