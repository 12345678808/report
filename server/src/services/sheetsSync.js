// Two-way sync between the app's database and a Google Sheet.
//
// DB -> Sheet: whenever an entry is saved (via the app's Edit button, or via
// the webhook below), we push that one row to the Sheet with the Sheets API.
// A full resync (POST /api/kpi/sheets/resync) rewrites the whole "KPI Data"
// tab from the database, useful for the very first setup or if the Sheet
// ever drifts.
//
// Sheet -> DB: the Sheet has a small Apps Script bound to it (see
// ../../google-apps-script/onEdit.gs) that fires on every edit and calls
// POST /api/sheets/webhook on this server with the edited row's values. That
// route (routes/sheetsWebhook.js) resolves the row back to a kpi_item_id +
// zone_id and calls the same upsertEntry() the REST API uses — so both
// directions go through one validated write path.
//
// This whole feature is optional and OFF by default (GOOGLE_SHEETS_ENABLED
// must be 'true'), so the app works exactly as before if you don't set it up.

const { google } = require('googleapis');

const SHEET_TAB = 'KPI Data';
const HEADER_ROW = ['Zone', 'Department', 'Report / KPI Parameter', 'Date', 'Target', 'Achievement', 'Pending', 'Performance %', 'Status', 'Note'];

let sheetsClient = null;

function isEnabled() {
  return String(process.env.GOOGLE_SHEETS_ENABLED).toLowerCase() === 'true';
}

function getClient() {
  if (!isEnabled()) return null;
  if (sheetsClient) return sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // .env stores the private key with literal "\n" sequences (multi-line PEM
  // values don't survive a plain KEY=value .env line otherwise) — swap them
  // back to real newlines before handing it to the JWT client.
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error(
      'GOOGLE_SHEETS_ENABLED is true but GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are missing from .env.'
    );
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEETS_ENABLED is true but GOOGLE_SHEETS_SPREADSHEET_ID is missing from .env.');
  return id;
}

function rowKey(zoneName, department, reportName, date) {
  return [zoneName, department, reportName, date].join('||').toLowerCase();
}

function toRowValues(item) {
  const pending = item.target != null && item.achievement != null ? Number(item.target) - Number(item.achievement) : '';
  const performance =
    item.target != null && Number(item.target) > 0 && item.achievement != null
      ? Number(item.achievement) / Number(item.target)
      : '';
  let status = '';
  if (performance !== '') {
    const pct = performance * 100;
    status = pct >= 85 ? 'Ok' : pct >= 50 ? 'Medium' : 'Low';
  }
  return [
    item.zone_name,
    item.department,
    item.report_name,
    item.date,
    item.target ?? '',
    item.achievement ?? '',
    pending,
    performance === '' ? '' : Number((performance * 100).toFixed(2)),
    status,
    item.note || '',
  ];
}

// Rewrites the whole tab from a full DB snapshot (see kpiStore.getFullSnapshot).
// Used for first-time setup and manual resync — not called on every edit,
// since that would be far more Sheets-API traffic than necessary.
async function pushFullSnapshot(date, rows) {
  const sheets = getClient();
  if (!sheets) return { skipped: true };
  const spreadsheetId = getSpreadsheetId();

  const values = [HEADER_ROW, ...rows.map((r) => toRowValues({ ...r, date }))];
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_TAB}!A:Z`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
  return { pushed: values.length - 1 };
}

// Pushes (or updates) exactly one row after an admin edit. Finds the
// matching row by (zone, department, report name, date) and overwrites it;
// appends a new row if it isn't there yet (e.g. sheet was resynced for a
// different date). Best-effort: callers should catch/log failures rather
// than let a Sheets hiccup break the actual save.
async function pushEntryToSheet(item) {
  const sheets = getClient();
  if (!sheets) return { skipped: true };
  const spreadsheetId = getSpreadsheetId();

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_TAB}!A2:D`,
  });
  const dataRows = existing.data.values || [];
  const targetKey = rowKey(item.zone_name, item.department, item.report_name, item.date);
  const matchIndex = dataRows.findIndex((r) => rowKey(r[0], r[1], r[2], r[3]) === targetKey);

  const values = [toRowValues(item)];
  if (matchIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_TAB}!A:J`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  } else {
    const rowNumber = matchIndex + 2; // +1 for header, +1 for 1-indexing
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_TAB}!A${rowNumber}:J${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }
  return { synced: true };
}

module.exports = { isEnabled, pushFullSnapshot, pushEntryToSheet, SHEET_TAB, HEADER_ROW };
