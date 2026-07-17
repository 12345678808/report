// Imports figures from the CCMC master-register spreadsheet (the one the
// commissioner's office already maintains in Google Sheets, and which can
// also be downloaded as an .xlsx and uploaded here) — matched by
// Department + Report name (not by internal ID, since the sheet has no idea
// what this app's kpi_item_id/zone_id values are), so the sheet's row order
// or the app's own catalog order can drift without breaking the import.
//
// The expected sheet shape (this is what the real master register looks
// like — confirmed against the actual CCMC sheet):
//   col 0: S.No
//   col 1: DEPARTMENT
//   col 2: REPORTS
//   col 3: TARGET (PER DAY)          <- overall target, not imported (each
//                                        zone's own target below is what's used)
//   then one 4-column block per zone, in whatever order the sheet has them,
//   each block: TARGET | ACHIEVED | PENDING | %
//   then a final 5-column overall summary block: TARGET | ACHIEVEMENT |
//   PENDING | Performance % | Status  <- also not imported; the app
//   recomputes pending/performance/status itself from target+achievement so
//   it always matches the rest of the app's math (see kpiStore.deriveStatus)
//
// Only TARGET and ACHIEVED are read from each zone's 4-column block. A
// header-detection pass finds each zone's block by locating that zone's name
// in the near-top rows (handles the sheet's merged header cells, which only
// carry a value in their top-left cell when exported to CSV/xlsx).
const XLSX = require('xlsx');
const { pool } = require('../db');
const { upsertEntry } = require('./kpiStore');

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Strips currency symbols/commas/percent signs so "₹25,000.00" / "1,234" /
// "94.83%" all parse as plain numbers. Blank/dash/non-numeric -> null.
function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '—') return null;
  const cleaned = s.replace(/[₹,%\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Turns a worksheet (already loaded via XLSX.read, from either a CSV string
// or an uploaded .xlsx buffer) into { department, reportName, perZone:
// { [zoneNameUpper]: { target, achievement } } } rows, using the known
// zone names to locate each zone's 4-column block in the header.
function parseMasterRegisterSheet(worksheet, zoneNames) {
  const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
  if (grid.length === 0) return { rows: [], headerRowIndex: -1 };

  // Find the header row that names the zones (scan the first handful of
  // rows — the real sheet has 2-3 header rows above the data thanks to
  // merged title/date cells).
  const zoneNamesUpper = zoneNames.map((z) => normalize(z));
  let headerRowIndex = -1;
  let zoneStartCols = {}; // zoneName (normalized) -> starting column index (its TARGET column)
  for (let r = 0; r < Math.min(grid.length, 6); r++) {
    const row = grid[r];
    const found = {};
    for (let c = 0; c < row.length; c++) {
      const cell = normalize(row[c]);
      const zi = zoneNamesUpper.indexOf(cell);
      if (zi !== -1 && found[zoneNamesUpper[zi]] === undefined) {
        found[zoneNamesUpper[zi]] = c;
      }
    }
    // A real header row should name most/all of the zones we know about.
    if (Object.keys(found).length >= Math.max(1, zoneNamesUpper.length - 1)) {
      headerRowIndex = r;
      zoneStartCols = found;
      break;
    }
  }
  if (headerRowIndex === -1) {
    return { rows: [], headerRowIndex: -1, error: 'Could not find a header row naming the zones (' + zoneNames.join(', ') + ').' };
  }

  // Data rows: first column parses as a positive integer S.No.
  const rows = [];
  for (let r = headerRowIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    const sno = Number(row[0]);
    if (!Number.isFinite(sno) || sno <= 0) continue;
    const department = String(row[1] || '').trim();
    const reportName = String(row[2] || '').trim();
    if (!department || !reportName) continue;

    const perZone = {};
    for (const zoneName of zoneNames) {
      const startCol = zoneStartCols[normalize(zoneName)];
      if (startCol === undefined) continue;
      perZone[zoneName] = {
        target: parseNum(row[startCol]),
        achievement: parseNum(row[startCol + 1]),
      };
    }
    rows.push({ sno, department, reportName, perZone });
  }
  return { rows, headerRowIndex };
}

// Fetches one tab of the (publicly link-shared) master-register Google Sheet
// as CSV — no Google API credentials needed since the sheet is shared openly
// (this is the same "anyone with the link" export Google itself uses for
// File > Share > Publish, just addressed at one tab by name). Requires the
// deployed server to actually reach docs.google.com over the network (a dev
// sandbox may block this — see the egress note in the calling route).
async function fetchSheetTabCsv(spreadsheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Could not fetch tab "${tabName}" from the Google Sheet (HTTP ${res.status}). Check the tab name is exact, and that the sheet is still shared with "Anyone with the link".`
    );
  }
  const text = await res.text();
  // Google returns a small HTML error page (still HTTP 200) if the sheet/tab
  // doesn't exist or isn't shared — detect that rather than silently "parsing"
  // an HTML document as if it were CSV.
  if (/^\s*<(!DOCTYPE|html)/i.test(text)) {
    throw new Error(`Tab "${tabName}" doesn't seem to exist on that sheet (got an HTML error page back instead of CSV).`);
  }
  return text;
}

async function loadZoneNames() {
  const { rows } = await pool.query('SELECT id, name FROM zones ORDER BY id');
  return rows;
}

async function loadCatalog() {
  const { rows } = await pool.query('SELECT id, department, report_name FROM kpi_items');
  return rows;
}

// Applies parsed { department, reportName, perZone } rows to the database
// for one date: matches each row to a kpi_item by normalized
// department+report name, matches each zone by normalized name, and upserts
// target/achievement for (item, zone, date) via the same upsertEntry()
// path the REST API and webhook both use — so pending/performance/status
// stay derived consistently everywhere.
async function applyImportRows(dateIso, parsedRows) {
  const zones = await loadZoneNames();
  const zoneIdByName = new Map(zones.map((z) => [normalize(z.name), z.id]));
  const catalog = await loadCatalog();
  const itemIdByKey = new Map(catalog.map((it) => [`${normalize(it.department)}||${normalize(it.report_name)}`, it.id]));

  const unmatchedRows = [];
  let matchedRows = 0;
  let entriesWritten = 0;

  for (const row of parsedRows) {
    const key = `${normalize(row.department)}||${normalize(row.reportName)}`;
    const kpiItemId = itemIdByKey.get(key);
    if (!kpiItemId) {
      unmatchedRows.push({ department: row.department, reportName: row.reportName });
      continue;
    }
    matchedRows += 1;
    for (const [zoneName, figures] of Object.entries(row.perZone)) {
      const zoneId = zoneIdByName.get(normalize(zoneName));
      if (!zoneId) continue;
      if (figures.target === null && figures.achievement === null) continue; // nothing to write
      await upsertEntry({
        kpiItemId,
        zoneId,
        date: dateIso,
        target: figures.target,
        achievement: figures.achievement,
        note: '',
      });
      entriesWritten += 1;
    }
  }

  return { matchedRows, unmatchedRowCount: unmatchedRows.length, unmatchedRows, entriesWritten };
}

// Entry point for "Sync from Google Sheet".
async function importFromGoogleSheet({ spreadsheetId, tabName, dateIso }) {
  const csv = await fetchSheetTabCsv(spreadsheetId, tabName);
  const workbook = XLSX.read(csv, { type: 'string' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const zones = await loadZoneNames();
  const { rows, error } = parseMasterRegisterSheet(worksheet, zones.map((z) => z.name));
  if (error) throw new Error(error);
  if (rows.length === 0) throw new Error('No data rows found on that tab — double-check the tab name.');
  return applyImportRows(dateIso, rows);
}

// Entry point for "Sync from Excel upload" — same parsing, just fed an
// uploaded .xlsx file buffer instead of a fetched CSV string.
async function importFromExcelBuffer({ buffer, dateIso }) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const zones = await loadZoneNames();
  const { rows, error } = parseMasterRegisterSheet(worksheet, zones.map((z) => z.name));
  if (error) throw new Error(error);
  if (rows.length === 0) throw new Error('No data rows found in that file.');
  return applyImportRows(dateIso, rows);
}

module.exports = {
  parseMasterRegisterSheet,
  fetchSheetTabCsv,
  applyImportRows,
  importFromGoogleSheet,
  importFromExcelBuffer,
  normalize,
  parseNum,
};
