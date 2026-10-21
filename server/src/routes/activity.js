const router = require('express').Router();
const db = require('../db');
const { wrap, dayStartIso, nextDayIso } = require('../util');
const { GROUPS } = require('../activity');

const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// Admin: everybody's activity (filter by user / type / date).  Executive: only their own.
router.get('/', wrap(async (req, res) => {
  const q = req.query, w = [], p = [];
  const admin = req.user.role === 'admin';
  if (!admin) { w.push('a.user_id=?'); p.push(req.user.id); }
  else if (q.user) { w.push('a.user_id=?'); p.push(Number(q.user)); }
  if (q.group && GROUPS[q.group]) { w.push(`a.action IN (${GROUPS[q.group].map(() => '?').join(',')})`); p.push(...GROUPS[q.group]); }
  if (q.action) { w.push('a.action=?'); p.push(q.action); }
  if (q.lead_id) { w.push('a.lead_id=?'); p.push(Number(q.lead_id)); }
  if (q.search) { w.push('(a.summary LIKE ? OR a.lead_name LIKE ?)'); p.push(`%${q.search}%`, `%${q.search}%`); }
  if (isYmd(q.from)) { w.push('a.created_at >= ?'); p.push(dayStartIso(q.from)); }
  if (isYmd(q.to)) { w.push('a.created_at < ?'); p.push(nextDayIso(q.to)); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';

  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const { c: total } = await db.one(`SELECT COUNT(*) c FROM activity_log a ${where}`, p);
  const rows = (await db.all(`SELECT a.* FROM activity_log a ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...p, limit, (page - 1) * limit])).map((r) => ({ ...r, details: JSON.parse(r.details || '{}') }));
  const byGroup = {};
  for (const r of await db.all(`SELECT a.action, COUNT(*) c FROM activity_log a ${where} GROUP BY a.action`, p)) {
    for (const [g, list] of Object.entries(GROUPS)) if (list.includes(r.action)) byGroup[g] = (byGroup[g] || 0) + r.c;
  }
  res.json({ data: rows, total, page, limit, byGroup });
}));

module.exports = router;
