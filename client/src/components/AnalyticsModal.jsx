import { useId, useState } from 'react';
import { computeZoneStats, fmtNum, tierChartColor, tierPastelColor, tierFromStatus, tierLabel } from '../lib/kpiHelpers';

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Builds the four-point "recent trend" sparkline shown next to the gauge.
// Ported as-is from one.html: it is NOT a real historical query (the app only
// has one date of seeded data) — it fabricates a short lead-in to today's
// real achievement value (0 -> 38% -> 72% -> 100% of it) purely so the chart
// reads as a trend rather than a single dot. The gauge itself (today's
// achievement as % of target) is the one genuinely data-driven number here.
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

// A single line chart replaces the old radial-gauge + mini-sparkline combo
// (per explicit follow-up feedback: "design line chart mattum venum" — line
// chart design only). The achievement line's color still reflects the
// performance tier (Ok/Medium/Low — same tierChartColor used everywhere else
// in the app), and a dashed horizontal reference line now marks the target
// value directly on the chart, rather than as a small text chip off to the
// side.
function AnalyticsChart({ target, achievement, tier, todayIso, uid }) {
  const color = tierChartColor(tier);
  const gradId = `lineGrad${uid}`;
  const w = 460;
  const h = 220;
  const hasTarget = target > 0;
  const rawPct = hasTarget ? (achievement / target) * 100 : null;

  const padL = 14;
  const padR = 14;
  const padT = 40;
  const padB = 34;
  const chartX = padL;
  const chartW = w - padL - padR;
  const chartY = padT;
  const chartH = h - padT - padB;
  const maxVal = Math.max(target, achievement, 1) * 1.15;
  const yFor = (v) => chartY + chartH - (v / maxVal) * chartH;
  const baseY = chartY + chartH;

  // Same fabricated 4-point lead-in as before: this app only has one date of
  // seeded data per item, so this isn't a real historical query — it's a
  // smooth lead-in to today's real achievement value purely so the line
  // reads as a trend instead of a single dot.
  const pts = [
    [chartX, yFor(0)],
    [chartX + chartW * 0.3, yFor(achievement * 0.38)],
    [chartX + chartW * 0.62, yFor(achievement * 0.72)],
    [chartX + chartW * 0.9, yFor(achievement)],
  ];
  const anchorDate = new Date(`${todayIso}T00:00:00`);
  const ptDates = pts.map((_, idx) => {
    const d = new Date(anchorDate.getTime());
    d.setDate(d.getDate() - (pts.length - 1 - idx));
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
  const linePath = smoothLinePath(pts);
  const areaPath = `${linePath} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z`;
  const lastPt = pts[pts.length - 1];
  const targetY = hasTarget ? yFor(target) : null;
  // Keep the achievement-value label and the target-line label on opposite
  // horizontal ends of the chart so they don't collide even when achievement
  // is close to target (and their y-positions end up nearly the same).
  const targetLabelAboveLine = hasTarget && targetY - chartY > 14;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <text x={chartX} y="18" fontFamily="Arial" fontSize="10" fontWeight="bold" fill="#8C97A6" style={{ letterSpacing: '0.6px' }}>
        ACHIEVEMENT TREND
      </text>
      {hasTarget && (
        <text x={w - padR} y="18" textAnchor="end" fontFamily="Georgia,serif" fontSize="13" fontWeight="bold" fill={color}>
          {Math.round(rawPct)}% of target
        </text>
      )}

      {hasTarget && (
        <>
          <line
            x1={chartX}
            y1={targetY}
            x2={chartX + chartW}
            y2={targetY}
            stroke="#A9776B"
            strokeWidth="1.5"
            strokeDasharray="6,4"
          />
          <text
            x={chartX}
            y={targetLabelAboveLine ? targetY - 6 : targetY + 14}
            fontFamily="Arial"
            fontSize="10"
            fontWeight="bold"
            fill="#A9776B"
          >
            {`Target ${fmtNum(target)}`}
          </text>
        </>
      )}

      <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, m) => {
        const isLast = m === pts.length - 1;
        return (
          <g key={m}>
            <circle cx={p[0]} cy={p[1]} r={isLast ? 5 : 3} fill="#fff" stroke={color} strokeWidth="2.2" />
            <text
              x={p[0]}
              y={baseY + 16}
              textAnchor="middle"
              fontFamily="Arial"
              fontSize="9.5"
              fontWeight={isLast ? 'bold' : 'normal'}
              fill={isLast ? color : '#8C97A6'}
            >
              {ptDates[m]}
            </text>
          </g>
        );
      })}
      <circle cx={lastPt[0]} cy={lastPt[1]} r="9" fill={color} opacity="0.16" />
      <text
        x={lastPt[0]}
        y={lastPt[1] - 12}
        textAnchor="end"
        fontFamily="Georgia,serif"
        fontSize="14"
        fontWeight="bold"
        fill={color}
      >
        {fmtNum(achievement)}
      </text>
    </svg>
  );
}

// info: { dept, report, target, achievement, pending, performance, status, note, zoneName, zoneRows }
// dateIso: the single report date currently seeded (e.g. '2026-07-12')
export default function AnalyticsModal({ info, dateIso, onClose }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [period, setPeriod] = useState('day');

  const anchor = new Date(`${dateIso}T00:00:00`);
  let periodDisplay = `${anchor.getDate()}/${anchor.getMonth() + 1}`;
  let fromDate = dateIso;
  let toDate = dateIso;
  if (period === 'month') {
    periodDisplay = `${MONTH_NAMES_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`;
    fromDate = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (period === 'year') {
    periodDisplay = `${anchor.getFullYear()}`;
    fromDate = `${anchor.getFullYear()}-01-01`;
  }

  const target = Number(info.target);
  const achievement = Number(info.achievement);
  const hasNumbers = info.target !== null && info.target !== undefined && info.achievement !== null && info.achievement !== undefined;
  const tier = tierFromStatus(info.status);
  const accentColor = tier ? tierPastelColor(tier) : 'var(--sky-line)';

  const zoneStats = info.zoneName && info.zoneRows ? computeZoneStats(info.zoneRows) : null;
  const zoneTier = zoneStats && zoneStats.pct !== null ? (zoneStats.pct >= 85 ? 'Ok' : zoneStats.pct >= 50 ? 'Medium' : 'Low') : null;
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
          {hasNumbers && target >= 0 && achievement >= 0 ? (
            <AnalyticsChart target={target} achievement={achievement} tier={tier} todayIso={dateIso} uid={uid} />
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--ink-soft)', padding: '30px 4px', textAlign: 'center' }}>
              No numeric target/achievement figures available yet for this report item.
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
