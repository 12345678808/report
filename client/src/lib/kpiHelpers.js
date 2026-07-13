// Shared helpers used by both the Zone Analyzer cards and the per-row
// "View Analytics" modal — kept in one place so the aggregation logic and
// colour palettes can't drift out of sync between the two call sites.

export function tierChartColor(tier) {
  // vivid palette — used for the zone-analyzer bar/dot and the analytics
  // modal's radial gauge + sparkline.
  if (tier === 'Ok') return '#E8B93A';
  if (tier === 'Medium') return '#2FAE60';
  if (tier === 'Low') return '#E5484D';
  return '#8C97A6';
}

export function tierPastelColor(tier) {
  // muted palette — used for the analytics modal's status pill and the
  // zone-efficiency mini progress bar inside it.
  if (tier === 'Ok') return '#D3B279';
  if (tier === 'Medium') return '#8FB39E';
  if (tier === 'Low') return '#C79A93';
  return '#8C97A6';
}

export function tierFromStatus(status) {
  if (status === 'Ok' || status === 'Medium' || status === 'Low') return status;
  return null;
}

export function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// Aggregates one zone's rows into a single efficiency percentage, grouped by
// unit (Nos/MT/Rs) — mirrors one.html's client-side computeZoneStats().
export function computeZoneStats(rows) {
  const units = {
    Nos: { pAch: 0, pTgt: 0, unpaired: 0, hasPaired: false },
    MT: { pAch: 0, pTgt: 0, unpaired: 0, hasPaired: false },
    Rs: { pAch: 0, pTgt: 0, unpaired: 0, hasPaired: false },
  };
  let pairedAch = 0;
  let pairedTgt = 0;
  for (const row of rows) {
    const unit = units[row.unit] ? row.unit : null;
    if (!unit) continue;
    const t = row.target;
    const a = row.achievement;
    if (t !== null && t !== undefined && a !== null && a !== undefined) {
      units[unit].pAch += Number(a);
      units[unit].pTgt += Number(t);
      units[unit].hasPaired = true;
      pairedAch += Number(a);
      pairedTgt += Number(t);
    } else if (a !== null && a !== undefined) {
      units[unit].unpaired += Number(a);
    }
  }
  const pct = pairedTgt > 0 ? (pairedAch / pairedTgt) * 100 : null;
  return { units, pct };
}
