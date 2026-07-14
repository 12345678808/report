// "Live Zone Analyzer" summary cards — one card per zone, aggregating all of
// that zone's KPI rows (grouped by unit: Nos/MT/Rs) into a single efficiency
// percentage, color-coded by tier. This mirrors the same aggregation the
// original single-file dashboard did client-side (computeZoneStats in
// one.html) — it's done here in React rather than as a new backend endpoint
// since the existing GET /api/kpi/zone/:zoneId already returns everything
// needed per row.

import { computeZoneStats, tierChartColor, tierFromStatus } from '../lib/kpiHelpers';

export default function ZoneAnalyzer({ zones, rowsByZoneId, asOfDate }) {
  return (
    <div className="zone-analyzer">
      <div className="za-head">
        <div className="za-head-left">
          <div className="za-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </div>
          <div>
            <span className="za-badge-pill">Live Zone Analyzer</span>
            <p className="za-subtitle">
              Zone-wise KPI performance across North, South, East, West &amp; Central — SWM, Engineering, Revenue &amp;
              Grievances.
            </p>
          </div>
        </div>
        <div className="za-asof">As of {asOfDate}</div>
      </div>
      <div className="za-cards">
        {zones.map((zone) => {
          const rows = rowsByZoneId[zone.id] || [];
          const { pct } = computeZoneStats(rows);
          // A zone item's own `status` (computed by the backend per-row from
          // that row's own target/achievement) isn't the same as the zone's
          // aggregate tier — re-derive the tier from the aggregate pct so the
          // card matches the aggregate percentage it's actually showing.
          const aggStatus = pct === null ? null : pct >= 85 ? 'Ok' : pct >= 50 ? 'Medium' : 'Low';
          const tier = tierFromStatus(aggStatus);
          const color = tierChartColor(tier);
          const tint = tier ? `${color}1a` : 'var(--sky)';
          const barWidth = pct === null ? 0 : Math.max(0, Math.min(100, pct));
          const tierText = tier || 'No data yet';
          const pctText = pct === null ? '—' : `${Math.round(pct * 10) / 10}%`;
          return (
            <div className="za-card" key={zone.id} style={{ '--za-tier': color, '--za-tint': tint }}>
              <div className="za-card-top">
                <span className="za-zone-name">{zone.name} Zone</span>
                <span className="za-tier" title={`Overall performance: ${tierText}`}>
                  <span className="za-dot" />
                  <span className="za-tier-label">{tierText}</span>
                </span>
              </div>
              <div className="za-pct">{pctText}</div>
              <div className="za-pct-label">Zone Efficiency</div>
              <div className="za-bar-track">
                <div className="za-bar-fill" style={{ width: `${barWidth}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
