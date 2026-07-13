const { verifyToken } = require('../utils/tokens');

const COOKIE_NAME = 'iccc_token';

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please sign in again.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only Admin can make changes; Commissioner is read-only.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, COOKIE_NAME };
