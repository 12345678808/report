import { useEffect, useState } from 'react';
import { api } from '../api';
import KpiTable from './KpiTable';

const DATE = '2026-07-12'; // the one date seeded in the core MVP; wire up a real picker in the next iteration

export default function Dashboard({ user, onLoggedOut }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.common(DATE);
      setRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(payload) {
    const saved = await api.saveEntry(payload);
    setRows((prev) =>
      prev.map((r) =>
        r.kpiItemId === payload.kpiItemId
          ? { ...r, target: saved.target, achievement: saved.achievement, pending: saved.pending, performance: saved.performance, status: saved.status, note: saved.note }
          : r
      )
    );
  }

  async function handleLogout() {
    await api.logout();
    onLoggedOut();
  }

  return (
    <div className="dashboard">
      <header className="navbar">
        <div>
          <div className="navbar-org">Coimbatore City Municipal Corporation</div>
          <div className="navbar-sub">Department-wise Performance Dashboard</div>
        </div>
        <div className="navbar-user">
          <div>
            <div className="navbar-user-name">{user.displayName}</div>
            <div className="navbar-user-role">CCMC {user.role.toUpperCase()}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="sheet-wrap">
        <h1>Department-wise KPI &ndash; {DATE}</h1>
        {error && <p className="error-banner">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <KpiTable rows={rows} canEdit={user.role === 'admin'} onSave={handleSave} zoneId={null} date={DATE} />
        )}
      </main>
    </div>
  );
}
