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

export default function KpiTable({ rows, canEdit, onSave, zoneId, date }) {
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
          <th>S.No</th>
          <th>Department</th>
          <th>Report / KPI Parameter</th>
          <th>Target</th>
          <th>Achievement</th>
          <th>Pending</th>
          <th>Performance %</th>
          <th>Status</th>
          {canEdit && <th>Edit</th>}
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
              {canEdit && (
                <td className="center">
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
