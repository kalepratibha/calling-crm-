// Inbox = the executive's own work list: fresh clients handed to him today, shared clients, follow-ups, in-progress.
const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../auth');
const { wrap, nowIso, todayLocal } = require('../util');
const { MIN_CALLS } = require('../config');
const { markActive, distributionExecutives } = require('../attendance');
const { DISTRIBUTION_CUTOFF_HOUR } = require('../config');
const { distributeFresh } = require('../inbox');
const { logActivity } = require('../activity');

const mine = "l.executive_id = ? AND l.account_status != 'OPENED'";
const FILTERS = {
  // default list: fresh clients on top, then due call-backs, then everything else still to be worked on
  work: `${mine} AND l.call_count < ${MIN_CALLS} AND l.status != 'NOT_INTERESTED' AND NOT (l.status='CALLBACK' AND l.followup_at > ?)`,
  fresh: `${mine} AND l.call_count = 0`,
  // "Call-backs" page: Call back + Not pickup + Not interested clients - everybody the executive has to call again
  followups: `${mine} AND l.status IN ('CALLBACK','NO_ANSWER','NOT_INTERESTED')`,
  interested: `${mine} AND l.status = 'INTERESTED'`,
  shared: `${mine} AND l.shared_from IS NOT NULL AND l.call_count < ${MIN_CALLS}`,
  progress: `${mine} AND l.call_count > 0 AND l.call_count < ${MIN_CALLS} AND l.status != 'NOT_INTERESTED'`,
  all: 'l.executive_id = ?',
};

async function counts(uid) {
  const now = nowIso();
  return db.one(`SELECT
      COALESCE(SUM(l.call_count=0 AND l.account_status!='OPENED'),0) fresh,
      COALESCE(SUM(l.status IN ('CALLBACK','NO_ANSWER','NOT_INTERESTED') AND l.account_status!='OPENED'),0) followups,
      COALESCE(SUM(l.status='INTERESTED' AND l.account_status!='OPENED'),0) interested,
      COALESCE(SUM(l.status='CALLBACK' AND l.account_status!='OPENED' AND (l.followup_at IS NULL OR l.followup_at <= ?)),0) followups_due,
      COALESCE(SUM(l.shared_from IS NOT NULL AND l.call_count < ? AND l.account_status!='OPENED'),0) shared,
      COALESCE(SUM(l.call_count>0 AND l.call_count<? AND l.status!='NOT_INTERESTED' AND l.account_status!='OPENED'),0) progress,
      COALESCE(SUM(l.account_status!='OPENED' AND l.call_count<? AND l.status!='NOT_INTERESTED' AND NOT (l.status='CALLBACK' AND l.followup_at > ?)),0) work,
      COUNT(*) \`all\`
    FROM leads l WHERE l.executive_id=?`, [now, MIN_CALLS, MIN_CALLS, MIN_CALLS, now, uid]);
}

// Sidebar badge
router.get('/count', wrap(async (req, res) => {
  if (req.user.role !== 'executive') return res.json({ fresh: 0 });
  const c = await db.one("SELECT COUNT(*) c FROM leads WHERE executive_id=? AND call_count=0 AND account_status!='OPENED'", [req.user.id]);
  res.json({ fresh: c.c });
}));

router.get('/', wrap(async (req, res) => {
  if (req.user.role !== 'executive') return res.status(403).json({ message: 'Inbox is for executives' });
  await markActive(req.user.id);              // opening the inbox = present; make sure fresh clients are shared out
  await distributeFresh();
  const filter = FILTERS[req.query.filter] ? req.query.filter : 'work';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const w = [FILTERS[filter]], p = [req.user.id];
  if (filter === 'work') p.push(nowIso());
  if (req.query.search) { w.push('(l.name LIKE ? OR l.mobile LIKE ?)'); p.push(`%${req.query.search}%`, `%${String(req.query.search).replace(/\D/g, '') || req.query.search}%`); }
  const where = w.join(' AND ');
  const { c: total } = await db.one(`SELECT COUNT(*) c FROM leads l WHERE ${where}`, p);
  const order = filter === 'followups' ? "(l.status='CALLBACK') DESC, l.followup_at IS NULL, l.followup_at ASC, l.last_called_at ASC"
    : filter === 'interested' ? 'l.interested_at ASC, l.id ASC'
    : filter === 'shared' ? 'l.shared_at DESC'
    : filter === 'work' ? "(l.call_count=0) DESC, (l.status='CALLBACK') DESC, l.followup_at ASC, l.call_count ASC, l.created_at ASC, l.id ASC" : 'l.call_count ASC, l.created_at ASC, l.id ASC';
  const rows = await db.all(`SELECT l.*, u.name AS executive_name, s.name AS shared_from_name
    FROM leads l LEFT JOIN users u ON u.id=l.executive_id LEFT JOIN users s ON s.id=l.shared_from
    WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...p, limit, (page - 1) * limit]);
  const today = todayLocal();
  const { c: allotted } = await db.one('SELECT COUNT(*) c FROM leads WHERE executive_id=? AND inbox_date=?', [req.user.id, today]);
  res.json({ data: rows, total, page, limit, filter, counts: await counts(req.user.id), allotted_today: allotted, minCalls: MIN_CALLS });
}));

// Admin: who is present, how many fresh clients each one holds, how many are still waiting
router.get('/admin', requireAdmin, wrap(async (req, res) => {
  const today = todayLocal();
  const { c: unassigned } = await db.one('SELECT COUNT(*) c FROM leads WHERE call_count=0 AND executive_id IS NULL');
  const rows = await db.all(`SELECT u.id, u.name, u.phone, a.status AS attendance, a.first_login_at,
      (SELECT COUNT(*) FROM leads l WHERE l.executive_id=u.id AND l.call_count=0 AND l.account_status!='OPENED') AS fresh_left,
      (SELECT COUNT(*) FROM leads l WHERE l.executive_id=u.id AND l.inbox_date=?) AS allotted_today,
      (SELECT COUNT(*) FROM leads l WHERE l.executive_id=u.id AND l.shared_from IS NOT NULL AND l.call_count=0) AS shared_fresh,
      (SELECT COUNT(*) FROM calls c WHERE c.executive_id=u.id AND c.ended_at IS NOT NULL AND c.started_at >= ?) AS calls_24h
    FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.work_date=?
    WHERE u.role='executive' AND u.active=1 ORDER BY u.name`, [today, new Date(Date.now() - 86400000).toISOString(), today]);
  const dist = await distributionExecutives(today);
  const sharing = new Set(dist.list.map((e) => e.id));
  res.json({ today, unassigned, phase: dist.phase, cutoff_hour: DISTRIBUTION_CUTOFF_HOUR,
    executives: rows.map((r) => ({ ...r, in_distribution: sharing.has(r.id) })) });
}));

router.post('/distribute', requireAdmin, wrap(async (req, res) => {
  const r = await distributeFresh();
  await logActivity(req, 'INBOX_DISTRIBUTED', `Admin ran the distribution: ${r.distributed || 0} client(s) moved, ${r.present || 0} executive(s) present`, { details: r });
  res.json(r);
}));

module.exports = router;
