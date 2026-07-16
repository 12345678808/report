import { tierLabel } from '../lib/kpiHelpers';

// A compact companion to KpiTable for the "Department-wise Summary" export
// section — one row per department (already summed by buildDepartmentSummaryRows),
// not one row per KPI parameter, so it needs its own simpler columns rather
// than reusing KpiTable's per-item layout (S.No, Report name, Edit, etc.
// don't apply to an aggregate row).
function fmtPct(performance) {
  if (performance === null || performance === undefined) return '';
  return `${(performance * 100).toFixed(2)}%`;
}

function statusMeta(status) {
  if (status === 'Ok') return { label: tierLabel('Ok'), cls: 'dot-yellow' };
  if (status === 'Medium') return { label: 'Medium', cls: 'dot-green' };
  if (status === 'Low') return { label: 'Low', cls: 'dot-red' };
  return null;
}

export default function DepartmentSummaryTable({ rows }) {
  return (
    <table className="kpi-table dept-summary-table">
      <thead>
        <tr>
          <th style={{ width: '30%' }}>Department</th>
          <th>Total Target</th>
          <th>Total Achievement</th>
          <th>Pending</th>
          <th>Performance %</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const meta = statusMeta(row.status);
          return (
            <tr key={row.department}>
              <td className="dept">{row.department}</td>
              <td className="num">{row.target ?? ''}</td>
              <td className="num">{row.achievement ?? ''}</td>
              <td className="num">{row.pending ?? ''}</td>
              <td className="num">{fmtPct(row.performance)}</td>
              <td className="center">
                {meta && (
                  <span className="status-pill">
                    <span className={`status-dot ${meta.cls}`}></span>
                    {meta.label}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
