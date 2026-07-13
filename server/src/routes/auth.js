const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken } = require('../utils/tokens');
const { requireAuth, COOKIE_NAME } = require('../middleware/auth');

const router = express.Router();

const isProd = process.env.NODE_ENV === 'production';
const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
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
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, displayName: req.user.displayName });
});

module.exports = router;
