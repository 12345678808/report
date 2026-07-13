import { useId, useState } from 'react';
import { computeZoneStats, fmtNum, tierChartColor, tierPastelColor, tierFromStatus } from '../lib/kpiHelpers';

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

function AnalyticsChart({ target, achievement, tier, todayIso, uid }) {
  const color = tierChartColor(tier);
  const glowId = `gaugeGlow${uid}`;
  const gradId = `sparkGrad${uid}`;
  const w = 460;
  const h = 264;
  const hasTarget = target > 0;
  const rawPct = hasTarget ? (achievement / target) * 100 : null;
  const ringFrac = hasTarget ? Math.max(0, Math.min(rawPct, 100)) / 100 : achievement > 0 ? 1 : 0;
  const cx = 122;
  const cy = 128;
  const r = 74;
  const sw = 15;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - ringFrac);
  const overshoot = hasTarget && rawPct > 100;

  const sx = 246;
  const sy = 34;
  const sw2 = 190;
  const sh2 = 118;
  const padB2 = 22;
  const chartW2 = sw2;
  const chartH2 = sh2 - padB2;
  const maxVal2 = Math.max(target, achievement, 1) * 1.15;
  const yFor2 = (v) => sy + chartH2 - (v / maxVal2) * chartH2;
  const baseY2 = sy + chartH2;
  const pts = [
    [sx, baseY2],
    [sx + chartW2 * 0.3, yFor2(achievement * 0.38)],
    [sx + chartW2 * 0.62, yFor2(achievement * 0.72)],
    [sx + chartW2 * 0.9, yFor2(achievement)],
  ];
  const anchorDate = new Date(`${todayIso}T00:00:00`);
  const ptDates = pts.map((_, idx) => {
    const d = new Date(anchorDate.getTime());
    d.setDate(d.getDate() - (pts.length - 1 - idx));
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });
  const linePath2 = smoothLinePath(pts);
  const areaPath2 = `${linePath2} L${pts[pts.length - 1][0]},${baseY2} L${pts[0][0]},${baseY2} Z`;
  const lastPt2 = pts[pts.length - 1];

  const tLabel = `Target ${fmtNum(target)}`;
  const tChipW = tLabel.length * 6 + 16;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="3" floodColor={color} floodOpacity="0.5" />
        </filter>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EDF1F5" strokeWidth={sw} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        filter={`url(#${glowId})`}
      />
      {overshoot && (
        <circle
          cx={cx}
          cy={cy}
          r={r + 10}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="6,7"
          opacity="0.55"
        />
      )}

      {hasTarget ? (
        <>
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="Georgia,serif" fontSize="30" fontWeight="bold" fill={color}>
            {Math.round(rawPct)}%
          </text>
          <text x={cx} y={cy + 17} textAnchor="middle" fontFamily="Arial" fontSize="9.5" fontWeight="bold" fill="#8C97A6" style={{ letterSpacing: '0.6px' }}>
            OF TARGET
          </text>
        </>
      ) : (
        <>
          <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="Georgia,serif" fontSize="24" fontWeight="bold" fill={color}>
            {fmtNum(achievement)}
          </text>
          <text x={cx} y={cy + 17} textAnchor="middle" fontFamily="Arial" fontSize="9.5" fontWeight="bold" fill="#8C97A6" style={{ letterSpacing: '0.6px' }}>
            LOGGED
          </text>
        </>
      )}
      <text x={cx} y={cy + r + 30} textAnchor="middle" fontFamily="Arial" fontSize="11" fill="#5B6058">
        <tspan fontWeight="bold" fill={color}>{fmtNum(achievement)}</tspan> / {fmtNum(target)} target
      </text>

      <text x={sx} y="18" fontFamily="Arial" fontSize="10" fontWeight="bold" fill="#8C97A6" style={{ letterSpacing: '0.6px' }}>
        RECENT TREND
      </text>
      <path d={areaPath2} fill={`url(#${gradId})`} stroke="none" />
      <path d={linePath2} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, m) => {
        const isLast = m === pts.length - 1;
        return (
          <g key={m}>
            <circle cx={p[0]} cy={p[1]} r={isLast ? 4 : 2.4} fill="#fff" stroke={color} strokeWidth="2" />
            <text
              x={p[0]}
              y={baseY2 + 13}
              textAnchor="middle"
              fontFamily="Arial"
              fontSize="8.5"
              fontWeight={isLast ? 'bold' : 'normal'}
              fill={isLast ? color : '#8C97A6'}
            >
              {ptDates[m]}
            </text>
          </g>
        );
      })}
      <circle cx={lastPt2[0]} cy={lastPt2[1]} r="7" fill={color} opacity="0.16" />

      <rect x={sx} y={baseY2 + 24} width={tChipW} height="18" rx="9" fill="#fff" stroke="#A9776B" strokeWidth="1" />
      <text x={sx + tChipW / 2} y={baseY2 + 36} textAnchor="middle" fontFamily="Arial" fontSize="10" fontWeight="bold" fill="#A9776B">
        {tLabel}
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
            {tier} performance
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
          <span><i style={{ background: '#E8B93A' }} />Ok performance</span>
          <span><i style={{ background: '#fff', border: '1.5px solid #A9776B' }} />Target value</span>
        </div>

        {info.note && <div className="modal-note">{info.note}</div>}
      </div>
    </div>
  );
}
