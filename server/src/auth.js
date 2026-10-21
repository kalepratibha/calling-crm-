const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET } = require('./config');
const { markActive } = require('./attendance');

// Using the CRM = present today. Throttled to once a minute per user. The phone app polls all day in the
// background (/api/phone/*) — that must NOT count as being at work.
const lastTouch = new Map();
function touchPresence(req, user) {
  if (user.role !== 'executive' || req.originalUrl.startsWith('/api/phone')) return;
  const now = Date.now();
  if (now - (lastTouch.get(user.id) || 0) < 60_000) return;
  lastTouch.set(user.id, now);
  markActive(user.id).then((isNew) => { if (isNew) require('./inbox').distributeFresh().catch(() => {}); }).catch(() => {});
}

const sign = (u) => jwt.sign({ id: u.id, role: u.role }, JWT_SECRET, { expiresIn: '7d' });

async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Login required' });
  let p;
  try { p = jwt.verify(token, JWT_SECRET); } catch { return res.status(401).json({ message: 'Session expired, login again' }); }
  try {
    const user = await db.one('SELECT id,name,phone,role,active FROM users WHERE id=?', [p.id]);
    if (!user || !user.active) return res.status(401).json({ message: 'Account disabled' });
    req.user = user;
    touchPresence(req, user);
    next();
  } catch (e) { next(e); }
}

const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Admin only' });

module.exports = { sign, requireAuth, requireAdmin };
