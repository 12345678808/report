import { useState } from 'react';

const UNITS = ['Nos', 'MT', 'Rs'];

// Lets an admin define a brand-new KPI parameter that isn't in the seeded
// catalog yet — a new report/target/achievement line the department has
// started tracking. This is separate from editing an existing row's figures:
// this creates the row itself (see POST /api/kpi/items), which then behaves
// exactly like any other row (editable, shows up in dept-grouped tables, and
// rolls into the Overall citywide total if scope is 'zone').
export default function AddRowModal({ departments, onClose, onSubmit }) {
  const [department, setDepartment] = useState('');
  const [reportName, setReportName] = useState('');
  const [unit, setUnit] = useState('Nos');
  const [scope, setScope] = useState('zone');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!department.trim() || !reportName.trim()) {
      setError('Department and Report / KPI Parameter are both required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({ department: department.trim(), reportName: reportName.trim(), unit, scope });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <div className="modal-dept">New KPI Parameter</div>
            <div className="modal-title">Add Row</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form className="add-row-form" onSubmit={handleSubmit}>
          <label htmlFor="addRowDept">Department</label>
          <input
            id="addRowDept"
            list="add-row-departments"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. SWM"
          />
          <datalist id="add-row-departments">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>

          <label htmlFor="addRowName">Report / KPI Parameter</label>
          <input
            id="addRowName"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="e.g. New Streetlight Complaints"
          />

          <label htmlFor="addRowUnit">Unit</label>
          <select id="addRowUnit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          <label>Tracked</label>
          <div className="add-row-scope-toggle">
            <button type="button" className={scope === 'zone' ? 'active' : ''} onClick={() => setScope('zone')}>
              Per zone
            </button>
            <button type="button" className={scope === 'common' ? 'active' : ''} onClick={() => setScope('common')}>
              City-wide (common)
            </button>
          </div>
          <p className="add-row-hint">
            {scope === 'zone'
              ? "Every zone gets its own editable figure for this report, and it rolls up into the Overall report's citywide total."
              : 'A single org-wide figure, shown in the Overall report and the "Common for all zones" block.'}
          </p>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="add-row-submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add Row'}
          </button>
        </form>
      </div>
    </div>
  );
}
