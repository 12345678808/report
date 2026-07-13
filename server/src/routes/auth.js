const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken } = require('../utils/tokens');
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
// Locally, the React app (localhost:5173) and API (localhost:4000) are the
// same "site" for cookie purposes (browsers key SameSite off the registrable
// domain, not the port), so 'lax' works fine there. Once deployed, though,
// the frontend (e.g. your-app.vercel.app) and backend (e.g.
// your-api.onrender.com) are on genuinely different domains — a cross-site
// request — and 'lax' cookies are NOT sent on cross-site fetch/XHR calls
// (only on top-level navigations), so every API call after login would
// silently come back unauthenticated. 'none' fixes that, but browsers
// require 'secure: true' (HTTPS-only) whenever sameSite is 'none' — which is
// exactly what you get once NODE_ENV=production on a real host.
const cookieOpts = {
  httpOnly: true,
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
  maxAge: 12 * 60 * 60 * 1000, // 12h, matches JWT expiry
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [String(username).toLowerCase()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Incorrect username or password.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect username or password.' });

  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, cookieOpts);
  res.json({ id: user.id, username: user.username, role: user.role, displayName: user.display_name });
});

router.post('/logout', (req, res) => {
  // Must repeat the same sameSite/secure attributes used when the cookie was
  // set — browsers match on the full attribute set, not just the name, so a
  // mismatched clearCookie() call can silently fail to remove it.
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: cookieOpts.sameSite, secure: cookieOpts.secure });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, displayName: req.user.displayName });
});

module.exports = router;
