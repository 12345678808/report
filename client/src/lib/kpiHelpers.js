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

// The stored/derived tier value stays 'Ok' internally everywhere (deriveStatus's
// 99% threshold, tierChartColor/tierPastelColor lookups, the dot-yellow CSS
// class, etc.) — only the text shown to the user changes, per an explicit
// request to relabel the yellow ("Ok") tier as "Completed" without touching
// any of the underlying logic those other places depend on.
export function tierLabel(tier) {
  if (tier === 'Ok') return 'Completed';
  return tier;
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

// Same pending/performance/status formula the backend uses when saving one
// entry (see server/src/services/kpiStore.js deriveStatus) — replicated here
// so client-side aggregates (e.g. the citywide rollup below) land on the
// exact same Ok/Medium/Low thresholds as a real saved entry would.
export function deriveStatus(target, achievement) {
  const hasTarget = target !== null && target !== undefined && target > 0;
  const pending = hasTarget && achievement !== null && achievement !== undefined ? target - achievement : null;
  let performance = null;
  if (hasTarget && achievement !== null && achievement !== undefined) {
    performance = achievement / target;
  } else if (!hasTarget && achievement !== null && achievement !== undefined) {
    // Some KPIs (several Public Health items) have no fixed target at all —
    // treat the achievement figure itself as already being the percentage
    // instead of leaving Performance %/Status blank (kept in sync with the
    // same rule in server/src/services/kpiStore.js's deriveStatus).
    performance = achievement / 100;
  }
  let status = null;
  if (performance !== null) {
    const pct = performance * 100;
    // Tier thresholds: 99%+ = Ok/Completed (yellow), 90-98.99% = Medium (green),
    // below 90% = Low (red).
    status = pct >= 99 ? 'Ok' : pct >= 90 ? 'Medium' : 'Low';
  }
  return { pending, performance, status };
}

// Builds a citywide rollup of the 28 zone-scoped KPI items by summing each
// item's target/achievement across all 5 zones — so the Overall report can
// show all 32 KPIs (4 common + 28 citywide-summed) instead of just the 4
// common ones. Marked `editable: false, zoneAggregate: true` since a summed
// figure isn't a single real row to save — admins edit the real per-zone
// numbers from the Zone report tab instead.
export function buildCitywideRows(zones, rowsByZoneId) {
  const byItemId = new Map();
  for (const zone of zones) {
    const rows = rowsByZoneId[zone.id] || [];
    for (const row of rows) {
      if (!byItemId.has(row.kpiItemId)) {
        byItemId.set(row.kpiItemId, {
          kpiItemId: row.kpiItemId,
          sno: row.sno,
          department: row.department,
          reportName: row.reportName,
          unit: row.unit,
          target: null,
          achievement: null,
          note: '',
          editable: false,
          zoneAggregate: true,
        });
      }
      const acc = byItemId.get(row.kpiItemId);
      if (row.target !== null && row.target !== undefined) {
        acc.target = (acc.target ?? 0) + Number(row.target);
      }
      if (row.achievement !== null && row.achievement !== undefined) {
        acc.achievement = (acc.achievement ?? 0) + Number(row.achievement);
      }
    }
  }
  return Array.from(byItemId.values())
    .sort((a, b) => a.sno - b.sno)
    .map((row) => {
      const { pending, performance, status } = deriveStatus(row.target, row.achievement);
      return { ...row, pending, performance, status };
    });
}

// Collapses any set of KPI rows (e.g. the full 32-row Overall report) down to
// one row per department, summing target/achievement across every KPI
// parameter in that department — for the "Department-wise Summary" export
// section (a citywide total per department, not a per-KPI-parameter list).
// Re-derives pending/performance/status from the SUMMED figures (same
// 99%/90% thresholds as deriveStatus) rather than averaging each row's own
// status, since e.g. two 50%-performing rows summed might land in a
// different tier than either row alone.
export function buildDepartmentSummaryRows(rows) {
  const byDept = new Map();
  for (const row of rows) {
    if (!byDept.has(row.department)) {
      byDept.set(row.department, { department: row.department, target: null, achievement: null });
    }
    const acc = byDept.get(row.department);
    if (row.target !== null && row.target !== undefined) {
      acc.target = (acc.target ?? 0) + Number(row.target);
    }
    if (row.achievement !== null && row.achievement !== undefined) {
      acc.achievement = (acc.achievement ?? 0) + Number(row.achievement);
    }
  }
  return Array.from(byDept.values()).map((acc) => {
    const { pending, performance, status } = deriveStatus(acc.target, acc.achievement);
    return { department: acc.department, target: acc.target, achievement: acc.achievement, pending, performance, status };
  });
}
