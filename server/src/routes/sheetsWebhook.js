// Sheet -> DB direction of the two-way sync. The Apps Script bound to the
// Google Sheet (see ../../google-apps-script/onEdit.gs) calls this route
// every time someone edits a row in the "KPI Data" tab.
//
// This endpoint is NOT behind the normal cookie/JWT auth (Apps Script's
// UrlFetchApp doesn't carry the app's login cookie) — it's protected instead
// by a shared secret that must be set in both this server's .env
// (SHEETS_WEBHOOK_SECRET) and the Apps Script source. Treat that secret like
// a password: without it, this route is reachable by anyone who can guess
// the URL, and it can write to the database.

const express = require('express');
const crypto = require('crypto');
const { findKpiItemId, findZoneId, upsertEntry } = require('../services/kpiStore');

const router = express.Router();

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post('/webhook', async (req, res) => {
  const configuredSecret = process.env.SHEETS_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return res.status(503).json({ error: 'SHEETS_WEBHOOK_SECRET is not configured on this server.' });
  }
  const providedSecret = req.body?.secret || req.headers['x-sheets-webhook-secret'];
  if (!providedSecret || !timingSafeEqual(providedSecret, configuredSecret)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret.' });
  }

  const { zone, department, reportName, date, target, achievement, note } = req.body || {};
  if (!department || !reportName || !date) {
    return res.status(400).json({ error: 'department, reportName, and date are required.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return res.status(400).json({ error: 'date must be in YYYY-MM-DD format.' });
  }

  const scope = zone && !/^common$/i.test(String(zone).trim()) ? 'zone' : 'common';
  const kpiItemId = await findKpiItemId({ department, reportName, scope });
  if (!kpiItemId) {
    return res.status(404).json({
      error: `No KPI item found for department "${department}" + report "${reportName}" (scope: ${scope}). Check spelling against the catalog — this sync does not create new KPI parameters, only new dated figures for existing ones.`,
    });
  }
  const zoneId = scope === 'zone' ? await findZoneId(zone) : null;
  if (scope === 'zone' && !zoneId) {
    return res.status(404).json({ error: `No zone found named "${zone}".` });
  }

  const toNumberOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const saved = await upsertEntry({
    kpiItemId,
    zoneId,
    date,
    target: toNumberOrNull(target),
    achievement: toNumberOrNull(achievement),
    note: note || '',
  });

  res.json({ ok: true, saved });
});

module.exports = router;
