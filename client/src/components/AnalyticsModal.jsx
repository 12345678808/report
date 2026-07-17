import { useEffect, useId, useState } from 'react';
import { api } from '../api';
import { computeZoneStats, fmtNum, tierChartColor, tierPastelColor, tierFromStatus, tierLabel } from '../lib/kpiHelpers';

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function smoothLinePath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// Dark "market chart" styled trend line (per explicit follow-up feedback,
// modeled on a reference screenshot of a glowing green line-on-black chart).
// Unlike the old version, this plots ONLY real logged dates — history comes
// straight from GET /kpi/history, one entry per date that actually has a
// saved achievement, no fabricated lead-in points. Whichever date range is
// selected (Day/Month/Year, or the dashboard's own From–To picker) is
// exactly what can appear here; a date nobody chose or logged never shows.
function AnalyticsChart({ history, target, tier, uid }) {
  const color = tierChartColor(tier);
  const gradId = `lineGrad${uid}`;
  const glowId = `glow${uid}`;
  const w = 460;
  const h = 220;
  const hasTarget = target > 0;

  const padL = 20;
  const padR = 20;
  const padT = 44;
  const padB = 30;
  const chartX = padL;
  const chartW = w - padL - padR;
  const chartY = padT;
  const chartH = h - padT - padB;
  const baseY = chartY + chartH;

  const achievements = history.map((p) => p.achievement);
  const maxVal = Math.max(...achievements, hasTarget ? target : 0, 1) * 1.15;
  // Almost always 0 (achievements/targets are non-negative counts/sums) —
  // only dips below zero if a real logged figure genuinely is negative.
  const minVal = Math.min(0, ...achievements);
  const span = maxVal - minVal || 1;
  const yFor = (v) => chartY + chartH - ((v - minVal) / span) * chartH;
  const xFor = (i) => (history.length <= 1 ? chartX + chartW / 2 : chartX + (chartW * i) / (history.length - 1));

  const pts = history.map((p, i) => [xFor(i), yFor(p.achievement)]);
  const linePath = pts.length >= 2 ? smoothLinePath(pts) : '';
  const areaPath = pts.length >= 2 ? `${linePath} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z` : '';
  const lastPt = pts[pts.length - 1];
  const latest = history[history.length - 1];
  const targetY = hasTarget ? yFor(target) : null;

  // Skip labeling every single point once there are more than ~6 — keeps the
  // dark chart's date row readable instead of a wall of overlapping text.
  const labelEvery = history.length > 6 ? Math.ceil(history.length / 6) : 1;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <text x={chartX} y="20" fontFamily="Arial" fontSize="10" fontWeight="bold" fill="#7C8AA0" style={{ letterSpacing: '0.6px' }}>
        ACHIEVEMENT TREND
      </text>
      <text x={w - padR} y="20" textAnchor="end" fontFamily="Georgia,serif" fontSize="13" fontWeight="bold" fill={color}>
        {fmtNum(latest.achievement)}
      </text>

      {hasTarget && (
        <>
          <line x1={chartX} y1={targetY} x2={chartX + chartW} y2={targetY} stroke="#4A5568" strokeWidth="1.3" strokeDasharray="5,5" />
          <text x={chartX} y={targetY - 6} fontFamily="Arial" fontSize="9.5" fontWeight="bold" fill="#9AA6B8">
            {`Target ${fmtNum(target)}`}
          </text>
        </>
      )}

      {pts.length >= 2 && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}
      {pts.length >= 2 && (
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" filter={`url(#${glowId})`} />
      )}

      {pts.map((p, m) => {
        const isLast = m === pts.length - 1;
        const showLabel = isLast || m === 0 || m % labelEvery === 0;
        return (
          <g key={m}>
            <circle cx={p[0]} cy={p[1]} r={isLast ? 4.5 : 2.8} fill={isLast ? color : '#0b0f14'} stroke={color} strokeWidth="2" />
            {showLabel && (
              <text x={p[0]} y={baseY + 18} textAnchor="middle" fontFamily="Arial" fontSize="9.5" fontWeight={isLast ? 'bold' : 'normal'} fill={isLast ? color : '#7C8AA0'}>
                {shortDate(history[m].date)}
              </text>
            )}
          </g>
        );
      })}

      {lastPt && (
        <>
          <circle cx={lastPt[0]} cy={lastPt[1]} r="10" fill={color} opacity="0.18" />
          {(() => {
            const bubbleW = 58;
            const bubbleX = Math.min(Math.max(lastPt[0] - bubbleW / 2, chartX), chartX + chartW - bubbleW);
            const bubbleY = Math.max(lastPt[1] - 34, chartY - 2);
            return (
              <g>
                <rect x={bubbleX} y={bubbleY} width={bubbleW} height="20" rx="10" fill="#1c2530" stroke={color} strokeWidth="1" />
                <text x={bubbleX + bubbleW / 2} y={bubbleY + 14} textAnchor="middle" fontFamily="Arial" fontSize="10.5" fontWeight="bold" fill={color}>
                  {fmtNum(latest.achievement)}
                </text>
              </g>
            );
          })()}
        </>
      )}
    </svg>
  );
}

// info: { dept, report, target, achievement, pending, performance, status, note, zoneName, zoneRows }
// fromDateIso/toDateIso: the exact From/To range currently selected on the
// dashboard's date filter (equal to each other when a single day is picked).
// Previously this modal only ever received the "To" date and silently
// collapsed any selected range down to that one day — so picking, say,
// 10/7 - 14/7 on the dashboard (whose figures are the summed range) still
// showed the modal's Day view as just "14/7", making it look like a
// different, single-day figure. Now the Day view honors the real selected
// range, and only Month/Year (which derive their own start-of-period date)
// anchor off the To date.
export default function AnalyticsModal({ info, fromDateIso, toDateIso, onClose }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [period, setPeriod] = useState('day');

  const anchor = new Date(`${toDateIso}T00:00:00`);
  const fromAnchor = new Date(`${fromDateIso}T00:00:00`);
  const isDayRange = fromDateIso !== toDateIso;
  let periodDisplay = isDayRange
    ? `${fromAnchor.getDate()}/${fromAnchor.getMonth() + 1} – ${anchor.getDate()}/${anchor.getMonth() + 1}`
    : `${anchor.getDate()}/${anchor.getMonth() + 1}`;
  let fromDate = fromDateIso;
  let toDate = toDateIso;
  if (period === 'month') {
    periodDisplay = `${MONTH_NAMES_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`;
    fromDate = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`;
    toDate = toDateIso;
  } else if (period === 'year') {
    periodDisplay = `${anchor.getFullYear()}`;
    fromDate = `${anchor.getFullYear()}-01-01`;
    toDate = toDateIso;
  }

  // Target is now optional here too — a KPI with no target still has a
  // meaningful achievement figure (shown as achievement% per the no-target
  // rule elsewhere), so the chart should render off achievement alone rather
  // than requiring both. AnalyticsChart already treats target<=0 as "no
  // target line" internally (see hasTarget there).
  const target = info.target !== null && info.target !== undefined ? Number(info.target) : 0;
  const hasNumbers = info.achievement !== null && info.achievement !== undefined;
  const tier = tierFromStatus(info.status);
  const accentColor = tier ? tierPastelColor(tier) : 'var(--sky-line)';

  // Real day-by-day figures for exactly the period currently selected
  // (Day/Month/Year toggle above, or the dashboard's own From–To range) —
  // fetched fresh whenever the row or the period changes. `history === null`
  // means "still loading"; `[]` means the query came back with nothing to
  // show (a genuinely new row with no other logged dates yet).
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    if (!info.kpiItemId) {
      setHistory([]);
      return undefined;
    }
    api
      .kpiHistory({ kpiItemId: info.kpiItemId, zoneId: info.zoneId ?? null, fromDate, toDate })
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [info.kpiItemId, info.zoneId, fromDate, toDate]);

  const zoneStats = info.zoneName && info.zoneRows ? computeZoneStats(info.zoneRows) : null;
  const zoneTier = zoneStats && zoneStats.pct !== null ? (zoneStats.pct >= 99 ? 'Ok' : zoneStats.pct >= 90 ? 'Medium' : 'Low') : null;
  const zoneColor = zoneTier ? tierPastelColor(zoneTier) : 'var(--steel)';

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-accent" style={{ background: accentColor }} />
        <div className="modal-head">
          <div>
            <div className="modal-dept">{info.dept}{info.zoneName ? ` — ${info.zoneName} zone` : ''}</div>
            <div className="modal-title">{info.report}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-period-block">
          <div className="modal-period-toggle">
            <button type="button" className={period === 'day' ? 'active' : ''} onClick={() => setPeriod('day')}>Day</button>
            <button type="button" className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Month</button>
            <button type="button" className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>Year</button>
          </div>
          <div className="modal-period-display">{periodDisplay}</div>
          <div className="modal-period-dates">
            <label>From</label>
            <input type="date" value={fromDate} readOnly />
            <span className="to-sep">&ndash;</span>
            <label>To</label>
            <input type="date" value={toDate} readOnly />
          </div>
          <p className="modal-period-note">
            Demo filter &mdash; changes the reporting period shown for this KPI; figures stay as entered on the sheet.
          </p>
        </div>

        {tier && (
          <span className="modal-status-pill" style={{ background: tierPastelColor(tier) }}>
            {tierLabel(tier)} performance
          </span>
        )}

        <div className="modal-stats">
          <div className="modal-stat">
            <div className="modal-stat-label">Target</div>
            <div className="modal-stat-value">{info.target ?? '—'}</div>
          </div>
          <div className="modal-stat">
            <div className="modal-stat-label">Achievement</div>
            <div className="modal-stat-value">{info.achievement ?? '—'}</div>
          </div>
          <div className="modal-stat">
            <div className="modal-stat-label">Pending</div>
            <div className="modal-stat-value">{info.pending ?? '—'}</div>
          </div>
          <div className="modal-stat">
            <div className="modal-stat-label">Performance</div>
            <div className="modal-stat-value">
              {info.performance !== null && info.performance !== undefined ? `${(info.performance * 100).toFixed(2)}%` : '—'}
            </div>
          </div>
        </div>

        {zoneStats && (
          <div className="modal-zone-block">
            <div className="modal-zone-label">This Zone&rsquo;s Overall Efficiency &ndash; All Departments</div>
            <div className="modal-zone-row">
              <span className="modal-zone-name">{info.zoneName} Zone</span>
              <span className="modal-zone-pct">{zoneStats.pct === null ? '—' : `${Math.round(zoneStats.pct * 10) / 10}%`}</span>
            </div>
            <div className="modal-zone-bar-track">
              <div
                className="modal-zone-bar-fill"
                style={{ width: `${zoneStats.pct === null ? 0 : Math.max(0, Math.min(100, zoneStats.pct))}%`, background: zoneColor }}
              />
            </div>
          </div>
        )}

        <div className="modal-chart-wrap">
          {history === null ? (
            <p style={{ fontSize: '12px', color: '#7C8AA0', padding: '30px 4px', textAlign: 'center' }}>Loading trend…</p>
          ) : history.length > 0 ? (
            <AnalyticsChart history={history} target={target} tier={tier} uid={uid} />
          ) : (
            <p style={{ fontSize: '12px', color: '#7C8AA0', padding: '30px 4px', textAlign: 'center' }}>
              {hasNumbers
                ? 'No day-by-day figures logged for this exact period yet — pick a different date, or log more dates to build a trend.'
                : 'No numeric achievement figures available yet for this report item.'}
            </p>
          )}
        </div>

        <div className="modal-legend">
          <span><i style={{ background: '#E5484D' }} />Low performance</span>
          <span><i style={{ background: '#2FAE60' }} />Medium performance</span>
          <span><i style={{ background: '#E8B93A' }} />{tierLabel('Ok')} performance</span>
          <span><i style={{ background: '#fff', border: '1.5px solid #A9776B' }} />Target value</span>
        </div>

        {info.note && <div className="modal-note">{info.note}</div>}
      </div>
    </div>
  );
}
