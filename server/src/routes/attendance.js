const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../auth');
const { wrap, todayLocal } = require('../util');
const { WEEKLY_OFF, TZ } = require('../config');
const { STATUSES } = require('../attendance');
const { distributeFresh } = require('../inbox');
const { logActivity } = require('../activity');

const ymdOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// Attendance for a date range (default: this month). Admin gets every executive, an executive only himself.
// Cell status: PRESENT | HALF_DAY | ABSENT | LEAVE  (set)  — or computed: ABSENT (no sign-in on a past working day),
// NOT_YET (today, not signed in yet), OFF (weekly off), '' (future / before the executive was created).
router.get('/', wrap(async (req, res) => {
  const today = todayLocal();
  let from = req.query.from, to = req.query.to;
  if (!ymdOk(from)) from = today.slice(0, 8) + '01';
  if (!ymdOk(to)) to = addDays(today.slice(0, 8) + '01', 31).slice(0, 8) + '01', to = addDays(to, -1);
  if (Date.parse(to) - Date.parse(from) > 93 * 86400000) return res.status(400).json({ message: 'Choose at most 3 months' });

  const users = req.user.role === 'admin'
    ? await db.all("SELECT id,name,phone,created_at FROM users WHERE role='executive' AND active=1 ORDER BY name")
    : await db.all('SELECT id,name,phone,created_at FROM users WHERE id=?', [req.user.id]);
  const recs = await db.all('SELECT * FROM attendance WHERE work_date BETWEEN ? AND ? AND user_id IN (?)', [from, to, users.map((u) => u.id).concat(0)]);
  const byKey = new Map(recs.map((r) => [`${r.user_id}|${r.work_date}`, r]));

  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, dow: dow(d), off: WEEKLY_OFF.includes(dow(d)) });
  const out = users.map((u) => {
    const created = dateFmt.format(new Date(u.created_at));
    const cells = {}, sum = { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, LEAVE: 0 };
    for (const { date, off } of days) {
      const r = byKey.get(`${u.id}|${date}`);
      let status = '', auto = false;
      if (r) status = r.status;
      else if (date < created || date > today) status = '';
      else if (off) status = 'OFF';
      else if (date === today) status = 'NOT_YET';
      else { status = 'ABSENT'; auto = true; }
      if (sum[status] !== undefined) sum[status] += 1;
      cells[date] = { status, auto, manual: !!r?.manual, first_login_at: r?.first_login_at || null, last_seen_at: r?.last_seen_at || null, note: r?.note || '' };
    }
    return { id: u.id, name: u.name, phone: u.phone, cells, summary: sum };
  });
  res.json({ from, to, today, days, users: out });
}));

// Admin: set a day's status by hand (status = null -> back to automatic)
router.post('/', requireAdmin, wrap(async (req, res) => {
  const { user_id, date, status } = req.body;
  const note = String(req.body.note || '').trim().slice(0, 300) || null;
  const u = await db.one("SELECT id,name FROM users WHERE id=? AND role='executive'", [user_id]);
  if (!u) return res.status(404).json({ message: 'Executive not found' });
  if (!ymdOk(date)) return res.status(400).json({ message: 'Invalid date' });
  if (status && !STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  if (status) {
    await db.run(`INSERT INTO attendance (user_id, work_date, status, manual, note) VALUES (?,?,?,1,?)
      ON DUPLICATE KEY UPDATE status=VALUES(status), manual=1, note=VALUES(note)`, [u.id, date, status, note]);
  } else await db.run('DELETE FROM attendance WHERE user_id=? AND work_date=?', [u.id, date]);
  await logActivity(req, 'ATTENDANCE_SET', `${u.name} — ${date}: ${status ? status.replace('_', ' ') : 'back to automatic'}${note ? ` ("${note}")` : ''}`, { details: { user_id: u.id, date, status, note } });
  if (date === todayLocal()) await distributeFresh();       // present / absent today changes who gets fresh clients
  res.json({ ok: true });
}));

module.exports = router;
