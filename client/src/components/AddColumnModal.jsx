import { useState } from 'react';

// A custom column applies to every KPI row uniformly (e.g. "Budget Allocated") —
// it's a lightweight extra numeric metric layered on top of the fixed
// Target/Achievement/Pending/Performance/Status set, which stay structurally
// fixed since deriveStatus's formula depends on exactly those two.
export default function AddColumnModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Column name is required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit(name.trim());
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
            <div className="modal-dept">Custom Metric Column</div>
            <div className="modal-title">Add Column</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form className="add-row-form" onSubmit={handleSubmit}>
          <label htmlFor="new-col-name">Column name</label>
          <input
            id="new-col-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Budget Allocated"
            autoFocus
          />
          <p className="add-row-hint">
            This adds an extra editable column to every KPI row (both Overall and Zone tables). It sits alongside
            Target/Achievement and can be edited the same way. You can delete it later from the table header.
          </p>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="add-row-submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add Column'}
          </button>
        </form>
      </div>
    </div>
  );
}
