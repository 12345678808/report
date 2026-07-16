import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';
import KpiTable from './KpiTable';
import ZoneAnalyzer from './ZoneAnalyzer';
import PrintLetterhead from './PrintLetterhead';
import AnalyticsModal from './AnalyticsModal';
import AddRowModal from './AddRowModal';
import AddColumnModal from './AddColumnModal';
import ExportOptionsModal from './ExportOptionsModal';
import DepartmentSummaryTable from './DepartmentSummaryTable';
import Navbar from './Navbar';
import { buildCitywideRows, buildDepartmentSummaryRows, tierLabel } from '../lib/kpiHelpers';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad2(n) {
  return String(n).padStart(2, '0');
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function toDdMmYyyy(iso) {
  return iso.split('-').reverse().join('.'); // 2026-07-12 -> 12.07.2026
}
function reportGenLabels() {
  const now = new Date();
  const dateLabel = `${now.getDate()} ${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  const hh = now.getHours();
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const hh12 = hh % 12 === 0 ? 12 : hh % 12;
  const timeLabel = `${pad2(hh12)}:${pad2(now.getMinutes())} ${ampm}`;
  return { dateLabel, timeLabel };
}

export default function Dashboard({ user, onLoggedOut }) {
  const [view, setView] = useState('overall'); // 'overall' | 'zone'

  // FROM and TO are independently selectable (fixing an earlier bug where both
  // fields were bound to one shared date and always moved together). A
  // single-date view is just fromDate === toDate — the backend sums across
  // whatever range is picked either way. Both default to today.
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const isRange = fromDate !== toDate;

  const [commonRows, setCommonRows] = useState([]);
  const [loadingCommon, setLoadingCommon] = useState(true);
  const [error, setError] = useState('');

  // Zone catalog (id/name) is static — fetched once. Zone rows are date-range
  // scoped and refetched whenever fromDate/toDate changes.
  const [zones, setZones] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [zoneRowsById, setZoneRowsById] = useState({});
  const [loadingZones, setLoadingZones] = useState(true);
  const zoneCatalogLoadedRef = useRef(false);

  // Admin-defined custom metric columns (e.g. "Budget Allocated") — apply
  // uniformly across every row, fetched once and re-fetched after any
  // add/delete so every open table re-renders with the current set.
  const [customColumns, setCustomColumns] = useState([]);
  const customColumnsLoadedRef = useRef(false);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [analyticsInfo, setAnalyticsInfo] = useState(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);

  // Clicking "Download Report" opens a section-picker instead of exporting
  // immediately — exportModalFormat is 'pdf' | 'excel' | null (which format's
  // picker is open). multiExportSelection holds the confirmed choice ({
  // overall, zoneIds, deptSummary }) only while a combined export is actually
  // being generated — its presence is what mounts the off-screen
  // .multi-export-wrap tree that html2pdf captures (see handleDownloadPdfSections).
  const [exportModalFormat, setExportModalFormat] = useState(null);
  const [multiExportSelection, setMultiExportSelection] = useState(null);

  // Toggling this body class (rather than conditionally rendering the letterhead
  // itself) mirrors one.html's approach: the letterhead markup and CSS to hide
  // interactive chrome both key off `.force-letterhead` on <body>, so the same
  // stylesheet rules work whether the source was a single static file or, as
  // here, a React tree.
  useEffect(() => {
    document.body.classList.toggle('force-letterhead', isExportingPdf);
    return () => document.body.classList.remove('force-letterhead');
  }, [isExportingPdf]);

  async function loadCommon(from, to) {
    setLoadingCommon(true);
    setError('');
    try {
      const data = await api.common(from, to);
      setCommonRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCommon(false);
    }
  }

  async function loadZoneRows(from, to, zoneList) {
    setLoadingZones(true);
    setError('');
    try {
      const results = await Promise.all(zoneList.map((z) => api.zoneItems(z.id, from, to)));
      const byId = {};
      zoneList.forEach((z, i) => {
        byId[z.id] = results[i];
      });
      setZoneRowsById(byId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingZones(false);
    }
  }

  async function loadCustomColumns() {
    try {
      const cols = await api.getColumns();
      setCustomColumns(cols);
    } catch (err) {
      setError(err.message);
    }
  }

  // Zone catalog: fetch once on mount (a ref-guard, not a `zones.length`
  // dependency, since the effect itself sets `zones` — see the Overall-report
  // history in this file for why that self-triggering pattern is a trap).
  useEffect(() => {
    if (zoneCatalogLoadedRef.current) return;
    zoneCatalogLoadedRef.current = true;
    api
      .zones()
      .then((zoneList) => {
        setZones(zoneList);
        setActiveZoneId(zoneList[0]?.id ?? null);
      })
      .catch((err) => {
        setError(err.message);
        zoneCatalogLoadedRef.current = false;
      });
  }, []);

  useEffect(() => {
    if (customColumnsLoadedRef.current) return;
    customColumnsLoadedRef.current = true;
    loadCustomColumns();
  }, []);

  // Re-fetch common rows whenever the selected date range changes.
  useEffect(() => {
    loadCommon(fromDate, toDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  // Re-fetch every zone's rows whenever the selected date range changes, once
  // the zone catalog itself has arrived.
  useEffect(() => {
    if (zones.length === 0) return;
    loadZoneRows(fromDate, toDate, zones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, zones]);

  function handleFromDateChange(value) {
    if (!value) return;
    setFromDate(value);
    if (value > toDate) setToDate(value);
  }

  function handleToDateChange(value) {
    if (!value) return;
    setToDate(value);
    if (value < fromDate) setFromDate(value);
  }

  async function handleSaveCommon(payload) {
    const saved = await api.saveEntry(payload);
    setCommonRows((prev) =>
      prev.map((r) =>
        r.kpiItemId === payload.kpiItemId
          ? {
              ...r,
              target: saved.target,
              achievement: saved.achievement,
              pending: saved.pending,
              performance: saved.performance,
              status: saved.status,
              note: saved.note,
              customValues: { ...r.customValues, ...saved.customValues },
            }
          : r
      )
    );
  }

  async function handleSaveZone(payload) {
    const saved = await api.saveEntry(payload);
    setZoneRowsById((prev) => {
      const zoneRows = prev[payload.zoneId] || [];
      return {
        ...prev,
        [payload.zoneId]: zoneRows.map((r) =>
          r.kpiItemId === payload.kpiItemId
            ? {
                ...r,
                target: saved.target,
                achievement: saved.achievement,
                pending: saved.pending,
                performance: saved.performance,
                status: saved.status,
                note: saved.note,
                customValues: { ...r.customValues, ...saved.customValues },
              }
            : r
        ),
      };
    });
  }

  // Adds a brand-new KPI parameter (a new table row, not just a new date's
  // figure for an existing row). The server slots it into the right spot in
  // its department's sno sequence, which can shift other items' sno values —
  // simplest and safest is to just re-fetch both common and zone rows rather
  // than try to patch local state in a way that matches the server's reorder.
  async function handleAddRow(payload) {
    await api.addKpiItem(payload);
    await loadCommon(fromDate, toDate);
    if (zones.length) await loadZoneRows(fromDate, toDate, zones);
  }

  // Permanently removes a KPI parameter row (and, via ON DELETE CASCADE, all
  // its logged entries across every date/zone). Irreversible — the confirm
  // step lives in KpiTable right next to the button.
  async function handleDeleteRow(kpiItemId) {
    await api.deleteKpiItem(kpiItemId);
    await loadCommon(fromDate, toDate);
    if (zones.length) await loadZoneRows(fromDate, toDate, zones);
  }

  async function handleAddColumn(name) {
    await api.addColumn(name);
    await loadCustomColumns();
  }

  async function handleDeleteColumn(id) {
    await api.deleteColumn(id);
    await loadCustomColumns();
    // Existing rows still carry the deleted column's id in their customValues
    // map until the next fetch — a light re-fetch keeps things tidy, though
    // KpiTable only ever renders columns still present in `customColumns`.
    await loadCommon(fromDate, toDate);
    if (zones.length) await loadZoneRows(fromDate, toDate, zones);
  }

  async function handleLogout() {
    await api.logout();
    onLoggedOut();
  }

  // Plain rows (Overall report + the read-only "common for all zones" block)
  // open with no zone context, so the modal's zone-efficiency block stays hidden.
  function handleViewAnalytics(info) {
    setAnalyticsInfo(info);
  }

  // The active zone's own table additionally carries that zone's aggregate
  // rows, so the modal can show "this zone's overall efficiency" alongside
  // the single KPI row being viewed.
  function handleViewZoneAnalytics(info) {
    setAnalyticsInfo({ ...info, zoneName: activeZone?.name, zoneRows: activeZoneRows });
  }

  function rangeSlug() {
    return isRange ? `${fromDate}_to_${toDate}` : fromDate;
  }

  // A combined report's letterhead badge/filename should say something more
  // useful than a single fixed scope once more than one section can be
  // included — falls back to the exact old single-scope labels when the
  // selection is still just "whatever one thing was on screen" (the modal's
  // default), so the common case looks unchanged.
  function describeSelection(selection) {
    const parts = [];
    if (selection.overall) parts.push('Overall');
    if (selection.zoneIds.length === zones.length && zones.length > 0) parts.push('All Zones');
    else if (selection.zoneIds.length === 1) parts.push(zones.find((z) => z.id === selection.zoneIds[0])?.name || 'Zone');
    else if (selection.zoneIds.length > 1) parts.push(`${selection.zoneIds.length} Zones`);
    if (selection.deptSummary) parts.push('Dept Summary');
    if (parts.length === 0) return 'Report';
    if (parts.length === 1) return parts[0];
    return 'Combined Report';
  }

  async function handleDownloadPdfSections(selection) {
    if (isExportingPdf) return;
    setError('');
    setAnalyticsInfo(null); // don't capture an open modal into the PDF
    setIsExportingPdf(true);
    setMultiExportSelection(selection);
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      // Let the multi-export tree mount and the force-letterhead re-render
      // (badge shown, tabs/chips/edit buttons hidden) actually paint before
      // html2canvas grabs the DOM.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const target = document.querySelector('.multi-export-wrap');
      const scopeSlug = describeSelection(selection).replace(/\s+/g, '');
      const opt = {
        margin: 0.3,
        filename: `CCMC_${scopeSlug}_KPI_Report_${rangeSlug()}.pdf`.replace(/\s+/g, '_'),
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      };
      await html2pdf().set(opt).from(target).save();
    } catch (err) {
      setError(`Could not generate PDF: ${err.message}`);
    } finally {
      setIsExportingPdf(false);
      setMultiExportSelection(null);
    }
  }

  // Shared by every sheet the combined Excel export writes — identical column
  // layout/widths to the original single-view export, just parameterized by
  // which rows and title go into this particular sheet.
  function buildKpiSheet(rows, titleLabel) {
    const header = [
      'S.No',
      'Department',
      'Report / KPI Parameter',
      'Target',
      'Achievement',
      'Pending',
      'Performance %',
      'Status',
      ...customColumns.map((c) => c.name),
    ];
    const body = rows.map((r, i) => [
      i + 1,
      r.department,
      r.reportName,
      r.target ?? '',
      r.achievement ?? '',
      r.pending ?? '',
      r.performance !== null && r.performance !== undefined ? `${(r.performance * 100).toFixed(2)}%` : '',
      r.status ? tierLabel(r.status) : '',
      ...customColumns.map((c) => (r.customValues ? r.customValues[c.id] ?? '' : '')),
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([
      [`CCMC – ${titleLabel} KPI Report`],
      [`Date range: ${toDdMmYyyy(fromDate)} – ${toDdMmYyyy(toDate)}`],
      [],
      header,
      ...body,
    ]);
    sheet['!cols'] = [
      { wch: 6 }, // S.No
      { wch: 16 }, // Department
      { wch: 48 }, // Report / KPI Parameter
      { wch: 11 }, // Target
      { wch: 13 }, // Achievement
      { wch: 11 }, // Pending
      { wch: 14 }, // Performance %
      { wch: 10 }, // Status
      ...customColumns.map(() => ({ wch: 18 })),
    ];
    const lastColIdx = header.length - 1;
    sheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } },
    ];
    return sheet;
  }

  // Builds an .xlsx workbook with one sheet per selected section (Overall,
  // "Common for all Zones" + each selected zone individually, and/or a
  // Department-wise Summary sheet) — replaces the old single-sheet-of-
  // whatever's-on-screen export now that sections are picked explicitly.
  function handleDownloadExcelSections(selection) {
    if (isExportingExcel) return;
    setError('');
    setIsExportingExcel(true);
    try {
      const workbook = XLSX.utils.book_new();
      const usedNames = new Set();
      function appendUnique(sheet, desiredName) {
        let name = desiredName.slice(0, 31) || 'Sheet';
        let n = 2;
        while (usedNames.has(name)) {
          const suffix = ` (${n})`;
          name = desiredName.slice(0, 31 - suffix.length) + suffix;
          n += 1;
        }
        usedNames.add(name);
        XLSX.utils.book_append_sheet(workbook, sheet, name);
      }

      if (selection.overall) {
        appendUnique(buildKpiSheet(overallRows, 'Overall'), 'Overall');
      }
      if (selection.zoneIds.length > 0) {
        appendUnique(buildKpiSheet(commonRows, 'Common for all Zones'), 'Common (All Zones)');
        selection.zoneIds.forEach((zid) => {
          const zone = zones.find((z) => z.id === zid);
          appendUnique(buildKpiSheet(zoneRowsById[zid] || [], zone?.name || 'Zone'), zone?.name || 'Zone');
        });
      }
      if (selection.deptSummary) {
        const deptRows = buildDepartmentSummaryRows(overallRows);
        const deptHeader = ['Department', 'Total Target', 'Total Achievement', 'Pending', 'Performance %', 'Status'];
        const deptBody = deptRows.map((r) => [
          r.department,
          r.target ?? '',
          r.achievement ?? '',
          r.pending ?? '',
          r.performance !== null && r.performance !== undefined ? `${(r.performance * 100).toFixed(2)}%` : '',
          r.status ? tierLabel(r.status) : '',
        ]);
        const deptSheet = XLSX.utils.aoa_to_sheet([
          ['CCMC – Department-wise Summary'],
          [`Date range: ${toDdMmYyyy(fromDate)} – ${toDdMmYyyy(toDate)}`],
          [],
          deptHeader,
          ...deptBody,
        ]);
        deptSheet['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
        deptSheet['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
        ];
        appendUnique(deptSheet, 'Dept Summary');
      }

      const scopeSlug = describeSelection(selection).replace(/\s+/g, '');
      XLSX.writeFile(workbook, `CCMC_${scopeSlug}_KPI_Report_${rangeSlug()}.xlsx`.replace(/\s+/g, '_'));
    } catch (err) {
      setError(`Could not generate Excel file: ${err.message}`);
    } finally {
      setIsExportingExcel(false);
    }
  }

  const canEdit = user.role === 'admin';
  // Editing a target/achievement/custom value writes to exactly one
  // entry_date — that only makes sense when a single date is selected, not a
  // multi-day aggregate. Row/column catalog changes (add/delete) aren't
  // date-scoped, so those stay available to admin regardless of range.
  const canEditValues = canEdit && !isRange;
  const activeZone = zones.find((z) => z.id === activeZoneId);
  const activeZoneRows = activeZoneId != null ? zoneRowsById[activeZoneId] || [] : [];
  // All 32+ KPIs for the Overall report: the real common (citywide) rows,
  // editable as usual, plus a read-only citywide rollup of the zone-scoped
  // rows (summed across all 5 zones) — see buildCitywideRows for why those
  // aren't directly editable here.
  const overallRows = [...commonRows, ...buildCitywideRows(zones, zoneRowsById)];
  const loadingOverall = loadingCommon || (loadingZones && zones.length === 0);
  const fromLabel = toDdMmYyyy(fromDate);
  const toLabel = toDdMmYyyy(toDate);
  const isToday = !isRange && fromDate === todayIso();
  const departmentNames = Array.from(new Set(overallRows.map((r) => r.department))).sort();

  return (
    <div className="dashboard">
      <Navbar user={user} onLogout={handleLogout} />

      <main className="sheet-wrap">
        <PrintLetterhead
          scopeLabel={view === 'zone' ? activeZone?.name || 'Zone' : 'Overall'}
          genDateLabel={reportGenLabels().dateLabel}
          genTimeLabel={reportGenLabels().timeLabel}
        />

        {/* The bigger letterhead-style heading + date-range filter (ported
            from one.html's on-screen sheet-header/date-filter) is scoped to the
            Overall report only, per an explicit request — the Zone report tab
            keeps the plain heading it always had. The date-filter itself,
            though, is shown on both tabs and is now genuinely functional. */}
        {view === 'overall' ? (
          <>
            <h1 className="overall-letterhead-title">
              CCMC &ndash; Commissioner's Daily Review &ndash;
              <br />
              Department-wise KPI Master Register
            </h1>
            <div className="graphic-rule" />
            <div className="sheet-date">
              DATE RANGE <b>{fromLabel} &ndash; {toLabel}</b>
            </div>
          </>
        ) : (
          <h1>Department-wise KPI &ndash; {fromDate}{isRange ? ` to ${toDate}` : ''}</h1>
        )}
        {error && <p className="error-banner">{error}</p>}

        <div className="control-bar">
          <div className="view-tabs">
            <button type="button" className={view === 'overall' ? 'active' : ''} onClick={() => setView('overall')}>
              Overall report
            </button>
            <button type="button" className={view === 'zone' ? 'active' : ''} onClick={() => setView('zone')}>
              Zone report
            </button>
          </div>
          <div className="control-bar-actions">
            {canEdit && (
              <button type="button" className="add-row-btn" onClick={() => setShowAddRow(true)}>
                + Add Row
              </button>
            )}
            {canEdit && (
              <button type="button" className="add-col-btn" onClick={() => setShowAddColumn(true)}>
                + Add Column
              </button>
            )}
            <button type="button" className="pdf-btn" onClick={() => setExportModalFormat('pdf')} disabled={isExportingPdf}>
              {isExportingPdf ? 'Preparing PDF…' : 'Download Report (PDF)'}
            </button>
            <button type="button" className="excel-btn" onClick={() => setExportModalFormat('excel')} disabled={isExportingExcel}>
              {isExportingExcel ? 'Preparing Excel…' : 'Download Report (Excel)'}
            </button>
          </div>
        </div>

        {/* Date range filter — FROM and TO are now independently selectable.
            A single date (from === to) is editable inline; a genuine
            multi-day range shows the SUMmed target/achievement across those
            days (read-only, since a sum isn't one entry to write back to). */}
        <div className="date-filter">
          <label htmlFor="filterFromDate">From</label>
          <input
            type="date"
            id="filterFromDate"
            value={fromDate}
            onChange={(e) => handleFromDateChange(e.target.value)}
          />
          <span className="to-sep">&ndash; To &ndash;</span>
          <input
            type="date"
            id="filterToDate"
            value={toDate}
            onChange={(e) => handleToDateChange(e.target.value)}
          />
          <span className="date-filter-note">
            {isRange
              ? `Showing figures summed across ${fromLabel} – ${toLabel}. Select the same From and To date to edit figures inline.`
              : `Showing figures for ${fromLabel}. Pick any date to view it, or (as admin) log figures for it — entering a target/achievement for a date with nothing logged yet creates that day's row.`}
          </span>
        </div>

        {view === 'overall' &&
          (loadingOverall ? (
            <p>Loading…</p>
          ) : (
            <>
              <div className="zone-report-head">
                <span className="zone-report-title">Department-wise KPI &ndash; {isToday ? 'today' : isRange ? `${fromLabel} – ${toLabel}` : fromLabel}</span>
              </div>
              <KpiTable
                rows={overallRows}
                canEdit={canEditValues}
                canManageCatalog={canEdit}
                onSave={handleSaveCommon}
                onDeleteRow={handleDeleteRow}
                zoneId={null}
                date={fromDate}
                onViewAnalytics={handleViewAnalytics}
                showDeptHeadings={false}
                customColumns={customColumns}
                onDeleteColumn={handleDeleteColumn}
                isExportingPdf={isExportingPdf}
              />
            </>
          ))}

        {view === 'zone' &&
          (loadingZones && zones.length === 0 ? (
            <p>Loading…</p>
          ) : (
            <>
              <ZoneAnalyzer zones={zones} rowsByZoneId={zoneRowsById} />

              <div className="zone-common-block">
                <p className="zone-common-title">Common for all zones &ndash; Public Health</p>
                <KpiTable
                  rows={commonRows}
                  canEdit={false}
                  canManageCatalog={false}
                  onSave={() => {}}
                  zoneId={null}
                  date={fromDate}
                  onViewAnalytics={handleViewAnalytics}
                  customColumns={customColumns}
                  isExportingPdf={isExportingPdf}
                />
              </div>

              <div className="zone-chips">
                {zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    className={`zone-chip${z.id === activeZoneId ? ' active' : ''}`}
                    onClick={() => setActiveZoneId(z.id)}
                  >
                    {z.name} zone
                  </button>
                ))}
              </div>

              {activeZone && (
                <>
                  <div className="zone-report-head">
                    <span className="zone-report-title">{activeZone.name} zone &ndash; daily report</span>
                  </div>
                  <KpiTable
                    key={activeZone.id}
                    rows={activeZoneRows}
                    canEdit={canEditValues}
                    canManageCatalog={canEdit}
                    onSave={handleSaveZone}
                    onDeleteRow={handleDeleteRow}
                    zoneId={activeZone.id}
                    date={fromDate}
                    onViewAnalytics={handleViewZoneAnalytics}
                    customColumns={customColumns}
                    onDeleteColumn={handleDeleteColumn}
                    isExportingPdf={isExportingPdf}
                  />
                </>
              )}
            </>
          ))}
      </main>

      {/* Only mounted while a combined PDF export is actually being
          generated (see handleDownloadPdfSections) — positioned off-screen
          rather than display:none so html2canvas still gets a real, laid-out
          DOM tree to capture without the user seeing a flash of it on screen.
          Reuses PrintLetterhead + KpiTable/DepartmentSummaryTable exactly as
          the on-screen report does, just assembling whichever sections the
          Export Options modal picked, each starting on its own PDF page. */}
      {multiExportSelection && (
        <div className="multi-export-wrap sheet-wrap">
          <PrintLetterhead
            scopeLabel={describeSelection(multiExportSelection)}
            genDateLabel={reportGenLabels().dateLabel}
            genTimeLabel={reportGenLabels().timeLabel}
          />
          <div className="sheet-date">
            DATE RANGE <b>{fromLabel} &ndash; {toLabel}</b>
          </div>

          {multiExportSelection.overall && (
            <div className="export-section">
              <h2 className="export-section-title">Overall (Citywide)</h2>
              <KpiTable
                rows={overallRows}
                canEdit={false}
                canManageCatalog={false}
                onSave={() => {}}
                zoneId={null}
                date={fromDate}
                onViewAnalytics={() => {}}
                showDeptHeadings={false}
                customColumns={customColumns}
                isExportingPdf
              />
            </div>
          )}

          {multiExportSelection.zoneIds.length > 0 && (
            <div className="export-section">
              <h2 className="export-section-title">Common for all Zones &ndash; Public Health</h2>
              <KpiTable
                rows={commonRows}
                canEdit={false}
                canManageCatalog={false}
                onSave={() => {}}
                zoneId={null}
                date={fromDate}
                onViewAnalytics={() => {}}
                customColumns={customColumns}
                isExportingPdf
              />
            </div>
          )}

          {multiExportSelection.zoneIds.map((zid) => {
            const zone = zones.find((z) => z.id === zid);
            return (
              <div className="export-section" key={zid}>
                <h2 className="export-section-title">{zone?.name || 'Zone'} Zone</h2>
                <KpiTable
                  rows={zoneRowsById[zid] || []}
                  canEdit={false}
                  canManageCatalog={false}
                  onSave={() => {}}
                  zoneId={zid}
                  date={fromDate}
                  onViewAnalytics={() => {}}
                  customColumns={customColumns}
                  isExportingPdf
                />
              </div>
            );
          })}

          {multiExportSelection.deptSummary && (
            <div className="export-section">
              <h2 className="export-section-title">Department-wise Summary</h2>
              <DepartmentSummaryTable rows={buildDepartmentSummaryRows(overallRows)} />
            </div>
          )}
        </div>
      )}

      {exportModalFormat && (
        <ExportOptionsModal
          zones={zones}
          format={exportModalFormat}
          initialView={view}
          initialZoneId={activeZoneId}
          onClose={() => setExportModalFormat(null)}
          onConfirm={(selection) => {
            setExportModalFormat(null);
            if (exportModalFormat === 'pdf') handleDownloadPdfSections(selection);
            else handleDownloadExcelSections(selection);
          }}
        />
      )}

      {analyticsInfo && <AnalyticsModal info={analyticsInfo} dateIso={toDate} onClose={() => setAnalyticsInfo(null)} />}
      {showAddRow && (
        <AddRowModal departments={departmentNames} onClose={() => setShowAddRow(false)} onSubmit={handleAddRow} />
      )}
      {showAddColumn && <AddColumnModal onClose={() => setShowAddColumn(false)} onSubmit={handleAddColumn} />}
    </div>
  );
}
