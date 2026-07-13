import { useState } from 'react';
import { api } from '../api';

export default function LoginPage({ onLoggedIn }) {
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await api.login(username.trim(), password);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="seal">ICCC</div>
        <p className="login-title">CCMC &ndash; Commissioner's Daily Review</p>
        <p className="login-sub">Department-wise KPI Master Register</p>

        <div className="role-toggle">
          <button type="button" className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>
            Admin
          </button>
          <button
            type="button"
            className={role === 'commissioner' ? 'active' : ''}
            onClick={() => setRole('commissioner')}
          >
            Commissioner
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-note">
          Demo access &mdash; admin / admin@2026 &nbsp;|&nbsp; commissioner / comm@2026
        </p>
      </div>
    </div>
  );
}
