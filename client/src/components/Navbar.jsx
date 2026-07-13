import { useEffect, useState } from 'react';
import CcmcSeal from './CcmcSeal';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function initialsFor(displayName) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Ported from one.html's richer navbar (org seal + titles, a LIVE pill, a
// live clock chip, and a user chip). Two deliberate changes from the source
// file: one.html embedded two real people's photos as base64 data — the
// actual Commissioner's photo (kept, confirmed rights to use it — see
// public/commissioner-avatar.jpg) and an unrelated celebrity photo used as a
// stand-in "org avatar" (dropped; the CCMC seal covers that spot instead).
// The demo-only weather chip was also dropped since it's fake data with no
// real source, which doesn't belong in an app real staff use daily.
export default function Navbar({ user, onLogout }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const clockDate = `${now.getDate()} ${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
  const hh = now.getHours();
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const hh12 = hh % 12 === 0 ? 12 : hh % 12;
  const clockDay = `${DAY_NAMES[now.getDay()]} ${pad2(hh12)}:${pad2(now.getMinutes())} ${ampm}`;

  return (
    <div className="navbar">
      <div className="navbar-left">
        <button type="button" className="navbar-icon-btn" title="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="seal">
          <CcmcSeal width={36} height={36} />
        </div>
        <div className="navbar-titles">
          <div className="navbar-org">COIMBATORE CITY MUNICIPAL CORPORATION</div>
          <div className="navbar-sub">Integrated Command &amp; Control Centre (ICCC)</div>
          <div className="navbar-report-label">Department-wise Performance Dashboard (Report Card)</div>
        </div>
      </div>
      <div className="navbar-right">
        <span className="live-pill">
          <span className="dot" />
          LIVE
        </span>
        <div className="navbar-chip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="8" y1="3" x2="8" y2="7" />
            <line x1="16" y1="3" x2="16" y2="7" />
          </svg>
          <span>
            <span>{clockDate}</span>
            <span className="chip-sub">{clockDay}</span>
          </span>
        </div>
        <div className="navbar-user">
          <div className="navbar-user-avatar">
            {user.role === 'commissioner' ? (
              <img src="/commissioner-avatar.jpg" alt={user.displayName} />
            ) : (
              initialsFor(user.displayName)
            )}
          </div>
          <div className="navbar-user-text">
            <div className="navbar-user-name">{user.displayName}</div>
            <div className="navbar-user-role">CCMC {user.role.toUpperCase()}</div>
          </div>
        </div>
        <button type="button" className="navbar-icon-btn navbar-bell" title="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
          <span className="bell-dot" />
        </button>
        <button type="button" className="navbar-icon-btn" title="Log out" onClick={onLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
