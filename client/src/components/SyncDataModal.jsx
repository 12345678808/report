import { useState } from 'react';
import { api } from '../api';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Result summary shared by both the Google Sheet and Excel sync paths — same
// shape comes back from POST /api/admin/sync/google-sheet and
// /api/admin/sync/excel (see server/src/services/importSync.js).
function SyncResult({ result }) {
  if (!result) return null;
  return (
    <div className="sync-result">
      <p>
        Matched <b>{result.matchedRows}</b> KPI row{result.matchedRows === 1 ? '' : 's'}, wrote{' '}
        <b>{result.entriesWritten}</b> figure{result.entriesWritten === 1 ? '' : 's'}.
      </p>
      {result.unmatchedRowCount > 0 && (
        <>
          <p className="sync-result-warn">
            {result.unmatchedRowCount} row{result.unmatchedRowCount === 1 ? '' : 's'} in the sheet didn&rsquo;t match any KPI
            in the app (Department + Report name must match exactly):
          </p>
          <ul className="sync-result-list">
            {result.unmatchedRows.slice(0, 8).map((r, i) => (
              <li key={i}>{r.department} — {r.reportName}</li>
            ))}
            {result.unmatchedRows.length > 8 && <li>…and {result.unmatchedRows.length - 8} more</li>}
          </ul>
        </>
      )}
    </div>
  );
}

// Admin-only "Sync Data" — pulls target/achievement figures straight from the
// CCMC master-register spreadsheet (either its live Google Sheet, or an
// .xlsx download of the same sheet uploaded here) into the app, matched by
// Department + Report name for each zone's TARGET/ACHIEVED columns. See
// server/src/services/importSync.js for exactly what sheet shape is expected.
export default function SyncDataModal({ onClose, onSynced }) {
  const [mode, setMode] = useState('sheet'); // 'sheet' | 'excel'

  const [sheetUrl, setSheetUrl] = useState('');
  const [tabName, setTabName] = useState('');
  const [sheetDate, setSheetDate] = useState(todayIso());
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [sheetResult, setSheetResult] = useState(null);

  const [file, setFile] = useState(null);
  const [excelDate, setExcelDate] = useState(todayIso());
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelError, setExcelError] = useState('');
  const [excelResult, setExcelResult] = useState(null);

  async function handleSheetSync(e) {
    e.preventDefault();
    if (!tabName.trim()) {
      setSheetError('Tab name is required — e.g. "16-Jul-2026", exactly as it appears at the bottom of the Google Sheet.');
      return;
    }
    setSheetError('');
    setSheetResult(null);
    setSheetBusy(true);
    try {
      const result = await api.syncGoogleSheet({ tabName: tabName.trim(), date: sheetDate, sheetUrl: sheetUrl.trim() || undefined });
      setSheetResult(result);
      if (onSynced) await onSynced();
    } catch (err) {
      setSheetError(err.message);
    } finally {
      setSheetBusy(false);
    }
  }

  async function handleExcelSync(e) {
    e.preventDefault();
    if (!file) {
      setExcelError('Choose an .xlsx file first.');
      return;
    }
    setExcelError('');
    setExcelResult(null);
    setExcelBusy(true);
    try {
      const result = await api.syncExcel(file, excelDate);
      setExcelResult(result);
      if (onSynced) await onSynced();
    } catch (err) {
      setExcelError(err.message);
    } finally {
      setExcelBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card sync-data-card">
        <div className="modal-head">
          <div>
            <div className="modal-dept">Import from the master register</div>
            <div className="modal-title">Sync Data</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="sync-mode-toggle">
          <button type="button" className={mode === 'sheet' ? 'active' : ''} onClick={() => setMode('sheet')}>
            Google Sheet
          </button>
          <button type="button" className={mode === 'excel' ? 'active' : ''} onClick={() => setMode('excel')}>
            Excel Upload
          </button>
        </div>

        {mode === 'sheet' && (
          <form className="sync-form" onSubmit={handleSheetSync}>
            <label htmlFor="syncSheetUrl">Google Sheet link (optional)</label>
            <input
              id="syncSheetUrl"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="Leave blank to use the sheet already configured on the server"
            />

            <label htmlFor="syncTabName">Tab name</label>
            <input
              id="syncTabName"
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              placeholder="e.g. 16-Jul-2026 (exactly as shown on the sheet's tab)"
            />

            <label htmlFor="syncSheetDate">Save figures under date</label>
            <input id="syncSheetDate" type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} />

            {sheetError && <p className="login-error">{sheetError}</p>}
            <SyncResult result={sheetResult} />

            <button type="submit" className="add-row-submit" disabled={sheetBusy}>
              {sheetBusy ? 'Syncing…' : 'Sync from Google Sheet'}
            </button>
          </form>
        )}

        {mode === 'excel' && (
          <form className="sync-form" onSubmit={handleExcelSync}>
            <label htmlFor="syncExcelFile">Excel file (.xlsx)</label>
            <input
              id="syncExcelFile"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <label htmlFor="syncExcelDate">Save figures under date</label>
            <input id="syncExcelDate" type="date" value={excelDate} onChange={(e) => setExcelDate(e.target.value)} />

            {excelError && <p className="login-error">{excelError}</p>}
            <SyncResult result={excelResult} />

            <button type="submit" className="add-row-submit" disabled={excelBusy}>
              {excelBusy ? 'Uploading…' : 'Upload & Sync'}
            </button>
          </form>
        )}

        <p className="sync-hint">
          Matches each row by Department + Report name, and each zone by name — the app's own
          pending/performance/status figures are recalculated from the imported target/achievement, not copied from
          the sheet.
        </p>
      </div>
    </div>
  );
}
