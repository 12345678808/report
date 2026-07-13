import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import KpiTable from './KpiTable';
import ZoneAnalyzer from './ZoneAnalyzer';
import PrintLetterhead from './PrintLetterhead';
import AnalyticsModal from './AnalyticsModal';
import Navbar from './Navbar';

const DATE = '2026-07-12'; // the one date seeded in the core MVP; wire up a real picker in a later iteration

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad2(n) {
  return String(n).padStart(2, '0');
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

  const [commonRows, setCommonRows] = useState([]);
  const [loadingCommon, setLoadingCommon] = useState(true);
  const [error, setError] = useState('');

  const [zones, setZones] = useState([]);
  const [activeZoneId, setActiveZoneId] = useState(null);
  // rows for every zone, keyed by zone id — fetched once so the Zone Analyzer's
  // 5 aggregate cards and the single active zone's editable table both read
  // from the same data, without re-fetching a zone every time you switch chips.
  const [zoneRowsById, setZoneRowsById] = useState({});
  const [loadingZones, setLoadingZones] = useState(false);
  // Guards the "load zones once" effect below. We intentionally do NOT use
  // zones.length as the effect's dependency/guard, because the effect itself
  // calls setZones() — that would change zones.length mid-flight, re-run the
  // effect, fire the previous run's cleanup (cancelled = true), and cause the
  // still-in-flight Promise.all(...).then(setZoneRowsById) to be silently
  // dropped by its own cancellation check. A ref sidesteps that self-trigger.
  const zonesLoadedRef = useRef(false);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [analyticsInfo, setAnalyticsInfo] = useState(null);

  // Toggling this body class (rather than conditionally rendering the letterhead
  // itself) mirrors one.html's approach: the letterhead markup and CSS to hide
  // interactive chrome both key off `.force-letterhead` on <body>, so the same
  // stylesheet rules work whether the source was a single static file or, as
  // here, a React tree.
  useEffect(() => {
    document.body.classList.toggle('force-letterhead', isExportingPdf);
    return () => document.body.classList.remove('force-letterhead');
  }, [isExportingPdf]);

  async function loadCommon() {
    setLoadingCommon(true);
    setError('');
    try {
      const data = await api.common(DATE);
      setCommonRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingCommon(false);
    }
  }

  useEffect(() => {
    loadCommon();
  }, []);

  // Load the zone catalog + every zone's rows the first time the Zone report
  // tab is opened (not on initial mount) — no point fetching 5x28 rows for
  // someone who only ever looks at the Overall report.
  useEffect(() => {
    if (view !== 'zone' || zonesLoadedRef.current) return;
    zonesLoadedRef.current = true;
    let cancelled = false;
    async function loadAllZones() {
      setLoadingZones(true);
      setError('');
      try {
        const zoneList = await api.zones();
        if (cancelled) return;
        setZones(zoneList);
        setActiveZoneId(zoneList[0]?.id ?? null);
        const results = await Promise.all(zoneList.map((z) => api.zoneItems(z.id, DATE)));
        if (cancelled) return;
        const byId = {};
        zoneList.forEach((z, i) => {
          byId[z.id] = results[i];
        });
        setZoneRowsById(byId);
      } catch (err) {
        if (!cancelled) setError(err.message);
        if (!cancelled) zonesLoadedRef.current = false; // allow retry on next tab switch
      } finally {
        if (!cancelled) setLoadingZones(false);
      }
    }
    loadAllZones();
    return () => {
      cancelled = true;
    };
  }, [view]);

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
        filename: `CCMC_${scopeSlug}_KPI_Report_${DATE}.pdf`.replace(/\s+/g, '_'),
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

  return (
    <div className="dashboard">
      <Navbar user={user} onLogout={handleLogout} />

      <main className="sheet-wrap">
        <PrintLetterhead
          scopeLabel={view === 'zone' ? activeZone?.name || 'Zone' : 'Overall'}
          genDateLabel={reportGenLabels().dateLabel}
          genTimeLabel={reportGenLabels().timeLabel}
        />
        <h1>Department-wise KPI &ndash; {DATE}</h1>
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
          <button type="button" className="pdf-btn" onClick={handleDownloadPdf} disabled={isExportingPdf}>
            {isExportingPdf ? 'Preparing PDF…' : 'Download Report (PDF)'}
          </button>
        </div>

        {view === 'overall' &&
          (loadingCommon ? (
            <p>Loading…</p>
          ) : (
            <KpiTable
              rows={commonRows}
              canEdit={canEdit}
              onSave={handleSaveCommon}
              zoneId={null}
              date={DATE}
              onViewAnalytics={handleViewAnalytics}
            />
          ))}

        {view === 'zone' &&
          (loadingZones && zones.length === 0 ? (
            <p>Loading…</p>
          ) : (
            <>
              <ZoneAnalyzer zones={zones} rowsByZoneId={zoneRowsById} asOfDate={DATE.split('-').reverse().join('.')} />

              <div className="zone-common-block">
                <p className="zone-common-title">Common for all zones &ndash; Public Health</p>
                <KpiTable
                  rows={commonRows}
                  canEdit={false}
                  onSave={() => {}}
                  zoneId={null}
                  date={DATE}
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
                    date={DATE}
                    onViewAnalytics={handleViewZoneAnalytics}
                  />
                </>
              )}
            </>
          ))}
      </main>

      {analyticsInfo && <AnalyticsModal info={analyticsInfo} dateIso={DATE} onClose={() => setAnalyticsInfo(null)} />}
    </div>
  );
}
