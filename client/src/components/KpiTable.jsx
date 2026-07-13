import { useState } from 'react';

function fmtPct(performance) {
  if (performance === null || performance === undefined) return '';
  return `${(performance * 100).toFixed(2)}%`;
}

function statusMeta(status) {
  if (status === 'Ok') return { label: 'Ok', cls: 'dot-yellow' };
  if (status === 'Medium') return { label: 'Medium', cls: 'dot-green' };
  if (status === 'Low') return { label: 'Low', cls: 'dot-red' };
  return null;
}

export default function KpiTable({ rows, canEdit, onSave, zoneId, date, onViewAnalytics }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ target: '', achievement: '', note: '' });
  const [savingId, setSavingId] = useState(null);

  function startEdit(row) {
    setEditingId(row.kpiItemId);
    setDraft({
      target: row.target ?? '',
      achievement: row.achievement ?? '',
      note: row.note ?? '',
    });
  }

  async function commitEdit(row) {
    setSavingId(row.kpiItemId);
    try {
      await onSave({
        kpiItemId: row.kpiItemId,
        zoneId: zoneId ?? null,
        date,
        target: draft.target === '' ? null : Number(draft.target),
        achievement: draft.achievement === '' ? null : Number(draft.achievement),
        note: draft.note,
      });
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <table className="kpi-table">
      <thead>
        <tr>
          <th style={{ width: '5%' }}>S.No</th>
          <th style={{ width: '14%' }}>Department</th>
          <th>Report / KPI Parameter</th>
          <th style={{ width: '9%' }}>Target</th>
          <th style={{ width: '11%' }}>Achievement</th>
          <th style={{ width: '9%' }}>Pending</th>
          <th style={{ width: '11%' }}>Performance %</th>
          <th style={{ width: '9%' }}>Status</th>
          <th style={{ width: '9%' }} className="analytics-col">Analytics</th>
          {canEdit && <th className="edit-col">Edit</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const meta = statusMeta(row.status);
          const isEditing = editingId === row.kpiItemId;
          return (
            <tr key={row.kpiItemId}>
              <td className="center">{row.sno}</td>
              <td className="dept">{row.department}</td>
              <td>{row.reportName}</td>
              <td className="num">
                {isEditing ? (
                  <input
                    type="number"
                    value={draft.target}
                    onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))}
                  />
                ) : (
                  row.target ?? ''
                )}
              </td>
              <td className="num">
                {isEditing ? (
                  <input
                    type="number"
                    value={draft.achievement}
                    onChange={(e) => setDraft((d) => ({ ...d, achievement: e.target.value }))}
                  />
                ) : (
                  row.achievement ?? ''
                )}
              </td>
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
              <td className="center analytics-cell">
                <button
                  type="button"
                  className="analytics-btn"
                  onClick={() =>
                    onViewAnalytics({
                      dept: row.department,
                      report: row.reportName,
                      target: row.target,
                      achievement: row.achievement,
                      pending: row.pending,
                      performance: row.performance,
                      status: row.status,
                      note: row.note,
                    })
                  }
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v18h18" />
                    <path d="M7 15l4-6 4 4 5-8" />
                  </svg>
                  View
                </button>
              </td>
              {canEdit && (
                <td className="center edit-col">
                  {isEditing ? (
                    <>
                      <button
                        className="mini-btn save"
                        disabled={savingId === row.kpiItemId}
                        onClick={() => commitEdit(row)}
                      >
                        {savingId === row.kpiItemId ? '…' : 'Save'}
                      </button>
                      <button className="mini-btn" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="mini-btn" onClick={() => startEdit(row)}>
                      Edit
                    </button>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
