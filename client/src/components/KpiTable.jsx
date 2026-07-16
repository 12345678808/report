import { Fragment, useState } from 'react';
import { tierLabel } from '../lib/kpiHelpers';

function fmtPct(performance) {
  if (performance === null || performance === undefined) return '';
  return `${(performance * 100).toFixed(2)}%`;
}

function statusMeta(status) {
  // The stored status stays 'Ok' (color/threshold logic elsewhere depends on
  // it) — tierLabel() only changes what text is shown for it ("Completed").
  if (status === 'Ok') return { label: tierLabel('Ok'), cls: 'dot-yellow' };
  if (status === 'Medium') return { label: 'Medium', cls: 'dot-green' };
  if (status === 'Low') return { label: 'Low', cls: 'dot-red' };
  return null;
}

export default function KpiTable({
  rows,
  canEdit,
  canManageCatalog = false,
  onSave,
  onDeleteRow,
  zoneId,
  date,
  onViewAnalytics,
  showDeptHeadings = true,
  customColumns = [],
  onDeleteColumn,
  // While a PDF export is being captured, the Analytics and Edit columns
  // used to stay in the DOM and get hidden with CSS (display:none). That
  // works fine for a live browser render, but html2canvas (used by the PDF
  // export) doesn't reliably recompute a colSpan against columns that are
  // present-but-hidden — it was leaving the navy department-heading bars
  // roughly 20% short of the table's real width. Actually removing those
  // columns from the DOM during export (not just hiding them) sidesteps the
  // bug entirely, since there's nothing left for html2canvas to miscount.
  isExportingPdf = false,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ target: '', achievement: '', note: '', customValues: {} });
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  function startEdit(row) {
    setEditingId(row.kpiItemId);
    setDraft({
      target: row.target ?? '',
      achievement: row.achievement ?? '',
      note: row.note ?? '',
      customValues: { ...(row.customValues || {}) },
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
        customValues: Object.fromEntries(
          Object.entries(draft.customValues || {}).map(([colId, val]) => [colId, val === '' ? null : Number(val)])
        ),
      });
      setEditingId(null);
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteClick(row) {
    if (deletingId) return;
    const label = `${row.department} — ${row.reportName}`;
    if (!window.confirm(`Permanently delete this KPI parameter?\n\n${label}\n\nThis removes all its logged figures across every date and zone. This cannot be undone.`)) {
      return;
    }
    setDeletingId(row.kpiItemId);
    try {
      await onDeleteRow(row.kpiItemId);
    } finally {
      setDeletingId(null);
    }
  }

  function handleDeleteColumnClick(col) {
    if (!window.confirm(`Delete the "${col.name}" column?\n\nThis removes its logged values for every row. This cannot be undone.`)) {
      return;
    }
    onDeleteColumn(col.id);
  }

  const showEditCol = (canEdit || canManageCatalog) && !isExportingPdf;
  const showAnalyticsCol = !isExportingPdf;
  const baseColCount = 8; // S.No, Dept, Report, Target, Achievement, Pending, Performance, Status
  const colSpan = baseColCount + customColumns.length + (showAnalyticsCol ? 1 : 0) + (showEditCol ? 1 : 0);

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
          {customColumns.map((col) => (
            <th key={col.id} className="custom-col-th">
              <span>{col.name}</span>
              {canManageCatalog && (
                <button
                  type="button"
                  className="custom-col-del"
                  title={`Delete "${col.name}" column`}
                  onClick={() => handleDeleteColumnClick(col)}
                >
                  &times;
                </button>
              )}
            </th>
          ))}
          {showAnalyticsCol && <th style={{ width: '9%' }} className="analytics-col">Analytics</th>}
          {showEditCol && <th className="edit-col">Edit</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const meta = statusMeta(row.status);
          const isEditing = editingId === row.kpiItemId;
          const rowEditable = row.editable !== false;
          const showDeptHeading = showDeptHeadings && (i === 0 || rows[i - 1].department !== row.department);
          return (
            <Fragment key={row.kpiItemId}>
              {showDeptHeading && (
                <tr className="dept-group-row">
                  <td colSpan={colSpan}>{row.department}</td>
                </tr>
              )}
              <tr>
              {/* S.No is shown as the row's plain position in this table (1, 2,
                  3, …), not the raw stored `sno` value — the stored value is
                  a catalog-ordering key with permanent gaps once a row is
                  deleted (deleting item #17 doesn't renumber #18 down to #17),
                  which read as "wrong" numbering to anyone looking at the
                  report. A recomputed sequential position always looks
                  correct after any add/delete, with no backend renumbering
                  needed — kpiItemId (not sno) is what edit/delete actually
                  key off, so this is purely cosmetic and safe. */}
              <td className="center">{i + 1}</td>
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
              {customColumns.map((col) => (
                <td className="num" key={col.id}>
                  {isEditing ? (
                    <input
                      type="number"
                      value={draft.customValues[col.id] ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, customValues: { ...d.customValues, [col.id]: e.target.value } }))
                      }
                    />
                  ) : (
                    (row.customValues && row.customValues[col.id]) ?? ''
                  )}
                </td>
              ))}
              {showAnalyticsCol && (
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
              )}
              {showEditCol && (
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
                    <div className="row-actions">
                      {canEdit && rowEditable && (
                        <button className="mini-btn" onClick={() => startEdit(row)}>
                          Edit
                        </button>
                      )}
                      {!rowEditable && <span className="edit-elsewhere">{row.editHint || 'Zone report'}</span>}
                      {canManageCatalog && (
                        <button
                          className="mini-btn delete"
                          disabled={deletingId === row.kpiItemId}
                          onClick={() => handleDeleteClick(row)}
                        >
                          {deletingId === row.kpiItemId ? '…' : 'Delete'}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              )}
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
