// Admin-only "Sync from Google Sheet" / "Sync from Excel upload" routes —
// pulls the CCMC master-register figures (department + report name + one
// TARGET/ACHIEVED block per zone) into the app's own database, matched by
// name rather than internal ID (see services/importSync.js for why, and for
// the exact expected sheet/file shape).
const express = require('express');
const multer = require('multer');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const importSync = require('../services/importSync');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Accepts either a full Google Sheets URL or a bare spreadsheet ID.
function extractSpreadsheetId(input) {
  if (!input) return null;
  const m = String(input).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // Otherwise assume the caller already passed a bare ID.
  return String(input).trim();
}

router.post('/google-sheet', requireAuth, requireAdmin, async (req, res) => {
  const { tabName, date, sheetUrl } = req.body || {};
  if (!tabName || !date) {
    return res.status(400).json({ error: 'tabName and date are required.' });
  }
  const spreadsheetId = extractSpreadsheetId(sheetUrl) || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    return res.status(400).json({ error: 'No spreadsheet configured — paste a Google Sheet link, or set GOOGLE_SHEETS_SPREADSHEET_ID in the server .env.' });
  }
  try {
    const result = await importSync.importFromGoogleSheet({ spreadsheetId, tabName, dateIso: date });
    res.json(result);
  } catch (err) {
    console.error('Google Sheet sync failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/excel', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  const { date } = req.body || {};
  if (!date) return res.status(400).json({ error: 'date is required.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (expected field name "file").' });
  try {
    const result = await importSync.importFromExcelBuffer({ buffer: req.file.buffer, dateIso: date });
    res.json(result);
  } catch (err) {
    console.error('Excel sync failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
