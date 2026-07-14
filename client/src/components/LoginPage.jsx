import { useState } from 'react';
import { api } from '../api';
import CcmcSeal from './CcmcSeal';

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
      // The Admin/Commissioner toggle above isn't just decoration — it's sent
      // along with the credentials, and the server rejects the login if the
      // account's real role doesn't match whichever tab is selected. That
      // way picking the wrong tab gives a clear "wrong role selected" error
      // instead of silently logging you in as the other role.
      const user = await api.login(username.trim(), password, role);
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
        <div className="seal">
          <CcmcSeal width={56} height={56} />
        </div>
        <p className="login-title">CCMC &ndash; Commissioner's Daily Review &ndash; Department-wise KPI Master Register</p>
        <p className="login-sub">Coimbatore City Municipal Corporation</p>

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
      </div>
    </div>
  );
}
