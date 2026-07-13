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
        <div className="seal">
          <svg viewBox="0 0 200 200" width="56" height="56">
            <path d="M100,100 L5,100 A95,95 0 0,1 100,5 Z" fill="#5FA23A" />
            <path d="M100,100 L100,5 A95,95 0 0,1 195,100 Z" fill="#E2601C" />
            <path d="M100,100 L100,195 A95,95 0 0,1 5,100 Z" fill="#1E8FC6" />
            <path d="M100,100 L195,100 A95,95 0 0,1 100,195 Z" fill="#F0C419" />
            <g fill="#14181C">
              <rect x="95.5" y="4" width="9" height="192" rx="4" />
              <rect x="4" y="95.5" width="192" height="9" rx="4" />
            </g>
            <circle cx="100" cy="100" r="95" fill="none" stroke="#14181C" strokeWidth="7" />
            <g fill="#ffffff">
              <circle cx="58" cy="60" r="14" />
              <rect x="55" y="71" width="6" height="13" rx="1.5" />
              <path d="M83,64 C83,58 88,53 88,53 C88,53 93,58 93,64 C93,67.9 90.8,71 88,71 C85.2,71 83,67.9 83,64 Z" />
              <path d="M71,76 C71,71.5 75.5,67 75.5,67 C75.5,67 80,71.5 80,76 C80,79.3 78,82 75.5,82 C73,82 71,79.3 71,76 Z" />
            </g>
            <g fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="114" y1="98" x2="114" y2="58" />
              <line x1="114" y1="58" x2="124" y2="52" />
            </g>
            <circle cx="124" cy="52" r="4" fill="#ffffff" />
            <g fill="#ffffff">
              <rect x="138" y="56" width="20" height="34" rx="2" />
              <polygon points="138,56 148,44 158,56" />
              <rect x="145" y="34" width="6" height="9" />
              <circle cx="148" cy="68" r="5" fill="#E2601C" />
              <rect x="144" y="82" width="8" height="8" />
            </g>
            <g fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round">
              <path d="M48,120 a15,15 0 0 1 24,0" />
              <path d="M53,126 a9,9 0 0 1 14,0" />
            </g>
            <circle cx="60" cy="133" r="3.2" fill="#ffffff" />
            <g fill="#ffffff">
              <polygon points="50,142 62,136 62,150 50,146" />
              <rect x="62" y="140" width="26" height="14" rx="3" />
              <circle cx="88" cy="147" r="5" fill="#1E8FC6" />
              <circle cx="88" cy="147" r="2.2" fill="#ffffff" />
            </g>
            <g fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M120,122 L120,136" />
              <path d="M120,127 L133,127" />
              <circle cx="126" cy="145" r="10" />
              <path d="M120,136 L113,150" />
            </g>
            <circle cx="120" cy="118" r="4.2" fill="#ffffff" />
            <g fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="150" cy="158" r="7" />
              <circle cx="166" cy="158" r="7" />
              <path d="M150,158 L160,142 L168,142" />
              <path d="M160,142 L150,158 L166,158 L159,150" />
            </g>
            <circle cx="160" cy="138" r="3.2" fill="#ffffff" />
          </svg>
        </div>
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
