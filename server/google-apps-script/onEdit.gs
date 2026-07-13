/**
 * ICCC Daily Report Card — Sheet -> Database sync trigger.
 *
 * WHAT THIS DOES
 * Whenever someone edits a cell in the "KPI Data" tab, this sends that row's
 * Zone / Department / Report / Date / Target / Achievement / Note to your
 * Express server, which looks up the matching KPI item and saves it — the
 * same as if an Admin had edited it inside the app.
 *
 * SETUP
 * 1. Open your Google Sheet -> Extensions -> Apps Script.
 * 2. Delete anything in the editor and paste this whole file in.
 * 3. Replace WEBHOOK_URL below with your server's public URL + /api/sheets/webhook
 *    (e.g. "https://your-server.example.com/api/sheets/webhook"). This will NOT
 *    work with "http://localhost:4000/..." — Google's servers run this script,
 *    not your computer, so they can't reach your localhost. Deploy the server
 *    somewhere with a public URL (Render, Railway, Fly.io, a VPS, etc.), or use
 *    a tunnel like ngrok while testing.
 * 4. Replace WEBHOOK_SECRET below with the exact SHEETS_WEBHOOK_SECRET value
 *    from your server's .env file. This is what stops random people on the
 *    internet from writing to your database through this URL — keep it secret,
 *    same as a password.
 * 5. In the Apps Script editor: Triggers (clock icon on the left) -> Add Trigger
 *    -> choose function "onEditInstallable", event source "From spreadsheet",
 *    event type "On edit" -> Save. (An *installable* trigger, not the simple
 *    onEdit(e) some tutorials use — installable triggers are the ones allowed
 *    to make outside network calls like this.)
 * 6. The first time it runs, Google will ask you to authorize the script —
 *    that's expected, approve it.
 *
 * SHEET LAYOUT EXPECTED (row 1 = header, already set up by the resync endpoint):
 * Zone | Department | Report / KPI Parameter | Date | Target | Achievement | Pending | Performance % | Status | Note
 *
 * Only Zone, Department, Report/KPI Parameter, Date, Target, Achievement, and
 * Note are actually sent — Pending / Performance % / Status are recalculated
 * by the server (single source of truth), so editing those columns directly
 * in the Sheet has no effect; they'll be overwritten on the next sync.
 */

var WEBHOOK_URL = 'https://YOUR-PUBLIC-SERVER-URL/api/sheets/webhook';
var WEBHOOK_SECRET = 'PASTE_YOUR_SHEETS_WEBHOOK_SECRET_HERE';
var SHEET_TAB_NAME = 'KPI Data';

function onEditInstallable(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_TAB_NAME) return;

    var row = e.range.getRow();
    if (row === 1) return; // header row, ignore

    // Ignore edits to columns G/H/I (Pending / Performance % / Status) —
    // those are server-derived and re-syncing them back would be pointless.
    var editedCol = e.range.getColumn();
    if (editedCol >= 7 && editedCol <= 9) return;

    var values = sheet.getRange(row, 1, 1, 10).getValues()[0];
    var payload = {
      secret: WEBHOOK_SECRET,
      zone: String(values[0] || '').trim(),
      department: String(values[1] || '').trim(),
      reportName: String(values[2] || '').trim(),
      date: formatDate(values[3]),
      target: values[4] === '' ? null : values[4],
      achievement: values[5] === '' ? null : values[5],
      note: String(values[9] || ''),
    };

    if (!payload.department || !payload.reportName || !payload.date) return;

    var response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() >= 300) {
      Logger.log('Sync failed (row ' + row + '): ' + response.getContentText());
    }
  } catch (err) {
    Logger.log('onEditInstallable error: ' + err);
  }
}

function formatDate(cellValue) {
  if (Object.prototype.toString.call(cellValue) === '[object Date]') {
    return Utilities.formatDate(cellValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(cellValue || '').trim();
}
