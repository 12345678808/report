import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import KpiTable from './KpiTable';
import ZoneAnalyzer from './ZoneAnalyzer';
import PrintLetterhead from './PrintLetterhead';
import AnalyticsModal from './AnalyticsModal';
import AddRowModal from './AddRowModal';
import Navbar from './Navbar';
import { buildCitywideRows } from '../lib/kpiHelpers';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad2(n) {
  return String(n).padStart(2, '0');
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

  // The date the whole dashboard is currently showing/editing. Defaults to
  // today's real date (fixing an earlier bug where a hardcoded 2026-07-12
  // never matched the actual current date) and is now a genuine filter —
  // changing it re-fetches both the common and zone-scoped rows for that
  // date. Admin edits for a date with no existing entry simply create one
  // (see upsertEntry on the server) — that's how "add a row for a new date"
  // works, no separate machinery needed for it.
  const [selectedDate, setSelectedDate] = useState(todayIso());

  const [commonRows, setCommonRows] = useState([]);
  const [loadingCommon, setLoadingCommon] = useState(true);
  const [error, setError] = useState('');

  // Zone catalog (id/name) is static — fetched once. Zone rows are date-scoped
  // and refetched whenever selectedDate changes.
  const [zones, setZones] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [zoneRowsById, setZoneRowsById] = useState({});
  const [loadingZones, setLoadingZones] = useState(true);
  const zoneCatalogLoadedRef = useRef(false);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [analyticsInfo, setAnalyticsInfo] = useState(null);
  const [showAddRow, setShowAddRow] = useState(false);

  // Toggling this body class (rather than conditionally rendering the letterhead
  // itself) mirrors one.html's approach: the letterhead markup and CSS to hide
  // interactive chrome both key off `.force-letterhead` on <body>, so the same
  // stylesheet rules work whether the source was a single static file or, as
  // here, a React tree.
  useEffect(() => {
    document.body.classList.toggle('force-letterhead', isExportingPdf);
    return () => document.body.classList.remove('force-letterhead');
  }, [isExportingPdf]);

  async function loadCommon(date) {
    setLoadingCommon(true);
    setError('');
    try {
      const data = await api.common(date);
      setCommonRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCommon(false);
    }
  }

  async function loadZoneRows(date, zoneList) {
    setLoadingZones(true);
    setError('');
    try {
      const results = await Promise.all(zoneList.map((z) => api.zoneItems(z.id, date)));
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

  // Re-fetch common rows whenever the selected date changes.
  useEffect(() => {
    loadCommon(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Re-fetch every zone's rows whenever the selected date changes, once the
  // zone catalog itself has arrived.
  useEffect(() => {
    if (zones.length === 0) return;
    loadZoneRows(selectedDate, zones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, zones]);

  async function handleSaveCommon(payload) {
    const saved = await api.saveEntry(payload);
    setCommonRows((prev) =>
      prev.map((r) =>
        r.kpiItemId === payload.kpiItemId
          ? { ...r, target: saved.target, achievement: saved.achievement, pending: saved.pending, performance: saved.performance, status: saved.status, note: saved.note }
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
            ? { ...r, target: saved.target, achievement: saved.achievement, pending: saved.pending, performance: saved.performance, status: saved.status, note: saved.note }
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
    await loadCommon(selectedDate);
    if (zones.length) await loadZoneRows(selectedDate, zones);
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

  async function handleDownloadPdf() {
    if (isExportingPdf) return;
    setError('');
    setAnalyticsInfo(null); // don't capture an open modal into the PDF
    setIsExportingPdf(true);
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      // Let the force-letterhead re-render (badge shown, tabs/chips/edit
      // buttons hidden) actually paint before html2canvas grabs the DOM.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const target = document.querySelector('.sheet-wrap');
      const scopeSlug = view === 'zone' ? activeZone?.name || 'Zone' : 'Overall';
      const opt = {
        margin: 0.3,
        filename: `CCMC_${scopeSlug}_KPI_Report_${selectedDate}.pdf`.replace(/\s+/g, '_'),
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
    }
  }

  const canEdit = user.role === 'admin';
  const activeZone = zones.find((z) => z.id === activeZoneId);
  const activeZoneRows = activeZoneId != null ? zoneRowsById[activeZoneId] || [] : [];
  // All 32+ KPIs for the Overall report: the real common (citywide) rows,
  // editable as usual, plus a read-only citywide rollup of the zone-scoped
  // rows (summed across all 5 zones) — see buildCitywideRows for why those
  // aren't directly editable here.
  const overallRows = [...commonRows, ...buildCitywideRows(zones, zoneRowsById)];
  const loadingOverall = loadingCommon || (loadingZones && zones.length === 0);
  const dateLabel = selectedDate.split('-').reverse().join('.'); // 2026-07-12 -> 12.07.2026
  const isToday = selectedDate === todayIso();
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
              DATE RANGE <b>{dateLabel} &ndash; {dateLabel}</b>
            </div>
          </>
        ) : (
          <h1>Department-wise KPI &ndash; {selectedDate}</h1>
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
            <button type="button" className="pdf-btn" onClick={handleDownloadPdf} disabled={isExportingPdf}>
              {isExportingPdf ? 'Preparing PDF…' : 'Download Report (PDF)'}
            </button>
          </div>
        </div>

        {/* Date range filter — picks the date the whole dashboard reads/writes.
            Both fields track the same date; true multi-day range aggregation
            isn't supported yet, this is a single-date picker shown as a range
            to match the original design. */}
        <div className="date-filter">
          <label htmlFor="filterFromDate">From</label>
          <input
            type="date"
            id="filterFromDate"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          />
          <span className="to-sep">&ndash; To &ndash;</span>
          <input
            type="date"
            id="filterToDate"
            value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          />
          <span className="date-filter-note">
            Showing figures for {dateLabel}. Pick any date to view it, or (as admin) log figures for it &mdash; entering a
            target/achievement for a date with nothing logged yet creates that day's row.
          </span>
        </div>

        {view === 'overall' &&
          (loadingOverall ? (
            <p>Loading…</p>
          ) : (
            <>
              <div className="zone-report-head">
                <span className="zone-report-title">Department-wise KPI &ndash; {isToday ? 'today' : dateLabel}</span>
              </div>
              <KpiTable
                rows={overallRows}
                canEdit={canEdit}
                onSave={handleSaveCommon}
                zoneId={null}
                date={selectedDate}
                onViewAnalytics={handleViewAnalytics}
                showDeptHeadings={false}
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
                  onSave={() => {}}
                  zoneId={null}
                  date={selectedDate}
                  onViewAnalytics={handleViewAnalytics}
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
                    canEdit={canEdit}
                    onSave={handleSaveZone}
                    zoneId={activeZone.id}
                    date={selectedDate}
                    onViewAnalytics={handleViewZoneAnalytics}
                  />
                </>
              )}
            </>
          ))}
      </main>

      {analyticsInfo && <AnalyticsModal info={analyticsInfo} dateIso={selectedDate} onClose={() => setAnalyticsInfo(null)} />}
      {showAddRow && (
        <AddRowModal departments={departmentNames} onClose={() => setShowAddRow(false)} onSubmit={handleAddRow} />
      )}
    </div>
  );
}
