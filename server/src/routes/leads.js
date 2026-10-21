const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../auth');
const { wrap, normalizePhone, nowIso, todayLocal } = require('../util');
const { MIN_CALLS } = require('../config');
const { logActivity } = require('../activity');
const { POOL_SQL, POOL_REASON_SQL, cutoffIso, inPool, poolReason, POOL_RETURN_DAYS } = require('../pool');

const BASE = `SELECT l.*, u.name AS executive_name FROM leads l LEFT JOIN users u ON u.id = l.executive_id`;
const WEBINAR = ['PENDING', 'REGISTERED', 'ATTENDED', 'NOT_ATTENDED'];
const ACCOUNT = ['NOT_OPENED', 'IN_PROGRESS', 'OPENED'];

function buildWhere(q, user) {
  const w = [], p = [];
  if (q.search) {
    w.push('(l.name LIKE ? OR l.mobile LIKE ?)');
    p.push(`%${q.search}%`, `%${String(q.search).replace(/\D/g, '') || q.search}%`);
  }
  if (q.status) { w.push('l.status = ?'); p.push(q.status); }
  if (user.role !== 'admin') {
    // An executive sees HIS OWN clients + the shared pool (everybody's Call back / Not pickup clients and the
    // Interested clients whose account was not opened within POOL_RETURN_DAYS). Other people's fresh clients stay hidden.
    if (q.scope === 'mine') { w.push('l.executive_id = ?'); p.push(user.id); }
    else if (q.scope === 'pool') { w.push(`(l.executive_id IS NULL OR l.executive_id <> ?) AND ${POOL_SQL}`); p.push(user.id, cutoffIso()); }
    else { w.push(`(l.executive_id = ? OR ${POOL_SQL})`); p.push(user.id, cutoffIso()); }
  }
  else if (q.executive === 'unassigned') w.push('l.executive_id IS NULL');
  else if (q.executive === 'mine') { w.push('l.executive_id = ?'); p.push(user.id); }
  else if (q.executive) { w.push('l.executive_id = ?'); p.push(Number(q.executive)); }
  if (q.calls === 'zero') w.push('l.call_count = 0');
  if (q.calls === 'lt') { w.push('l.call_count < ?'); p.push(MIN_CALLS); }
  if (q.calls === 'gte') { w.push('l.call_count >= ?'); p.push(MIN_CALLS); }
  if (q.group === '1' || q.group === '0') { w.push('l.group_joined = ?'); p.push(Number(q.group)); }
  if (q.webinar) { w.push('l.webinar_status = ?'); p.push(q.webinar); }
  if (q.account) { w.push('l.account_status = ?'); p.push(q.account); }
  if (q.followup === 'due') { w.push("l.status='CALLBACK' AND l.followup_at IS NOT NULL AND l.followup_at <= ?"); p.push(nowIso()); }
  return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

const FIELD_LABEL = { name: 'Name', mobile: 'Mobile', group_joined: 'WhatsApp group', webinar_status: 'Webinar', account_status: 'Account opening' };
const show = (k, v) => (k === 'group_joined' ? (v ? 'Joined' : 'Not joined') : String(v).replace(/_/g, ' '));

// Writes one readable activity row per kind of change (remark / assignment / other fields)
async function logLeadChanges(req, before, f) {
  const ref = { id: before.id, name: f.name || before.name };
  const changes = {}, parts = [];
  for (const k of Object.keys(FIELD_LABEL)) {
    if (f[k] !== undefined && f[k] !== before[k]) { changes[k] = [before[k], f[k]]; parts.push(`${FIELD_LABEL[k]}: ${show(k, before[k])} → ${show(k, f[k])}`); }
  }
  if (parts.length) await logActivity(req, 'CLIENT_UPDATED', `${ref.name} — ${parts.join(', ')}`, { lead: ref, details: { changes } });
  if (f.remark !== undefined && f.remark !== (before.remark || '')) {
    await logActivity(req, 'REMARK_UPDATED', `Edited remark for ${ref.name}`, { lead: ref, details: { old: before.remark || '', new: f.remark } });
  }
  if (f.executive_id !== undefined && f.executive_id !== before.executive_id && req.user.role === 'admin') {
    const nm = async (id) => (id ? (await db.one('SELECT name FROM users WHERE id=?', [id]))?.name : null) || 'Unassigned';
    await logActivity(req, 'CLIENT_ASSIGNED', `${ref.name} — assigned to ${await nm(f.executive_id)} (was ${await nm(before.executive_id)})`, { lead: ref, details: { from: before.executive_id, to: f.executive_id } });
  }
}

const SORTS = {
  newest: 'l.created_at DESC, l.id DESC',
  oldest: 'l.created_at ASC, l.id ASC',
  name: 'l.name ASC',
  calls: 'l.call_count DESC',
  last_called: 'l.last_called_at DESC',
};

router.get('/', wrap(async (req, res) => {
  const { where, params } = buildWhere(req.query, req.user);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { c: total } = await db.one(`SELECT COUNT(*) c FROM leads l ${where}`, params);
  const isExec = req.user.role !== 'admin';
  const sel = isExec
    ? `SELECT l.*, u.name AS executive_name, CASE WHEN l.executive_id = ? THEN NULL ELSE ${POOL_REASON_SQL} END AS pool_reason FROM leads l LEFT JOIN users u ON u.id = l.executive_id`
    : BASE;
  const rows = await db.all(`${sel} ${where} ORDER BY ${SORTS[req.query.sort] || SORTS.newest} LIMIT ? OFFSET ?`,
    [...(isExec ? [req.user.id] : []), ...params, limit, (page - 1) * limit]);
  res.json({ data: rows, total, page, limit, minCalls: MIN_CALLS, poolDays: POOL_RETURN_DAYS });
}));

// Next leads for the call desk: not yet 6 calls, not closed, not locked by another executive
router.get('/queue', wrap(async (req, res) => {
  res.json(await db.all(`${BASE}
    WHERE l.call_count < ? AND l.status != 'NOT_INTERESTED' AND l.account_status != 'OPENED'
      AND l.executive_id = ?
      AND NOT (l.status='CALLBACK' AND l.followup_at > ?)
    ORDER BY (l.call_count=0) DESC, (l.status='CALLBACK') DESC, l.call_count ASC, l.created_at ASC
    LIMIT 30`, [MIN_CALLS, req.user.id, nowIso()]));
}));

// Bulk-assign selected clients to one executive (admin panel)
router.post('/bulk-assign', requireAdmin, wrap(async (req, res) => {
  const ids = [...new Set((req.body.ids || []).map(Number).filter(Boolean))].slice(0, 500);
  const exec = req.body.executive_id ? await db.one("SELECT id,name FROM users WHERE id=? AND role='executive' AND active=1", [req.body.executive_id]) : null;
  if (!ids.length) return res.status(400).json({ message: 'Select at least one client' });
  if (req.body.executive_id && !exec) return res.status(400).json({ message: 'Executive not found' });
  await db.run('UPDATE leads SET executive_id=?, inbox_pinned=?, inbox_date=? WHERE id IN (?)', [exec ? exec.id : null, exec ? 1 : 0, exec ? todayLocal() : null, ids]);
  await logActivity(req, 'CLIENT_ASSIGNED', exec ? `Assigned ${ids.length} client(s) to ${exec.name}` : `Unassigned ${ids.length} client(s)`, { details: { ids, executive_id: exec?.id || null } });
  res.json({ ok: true, count: ids.length });
}));

// Bulk delete (admin panel): removes the clients together with their call history
router.post('/bulk-delete', requireAdmin, wrap(async (req, res) => {
  const ids = [...new Set((req.body.ids || []).map(Number).filter(Boolean))].slice(0, 500);
  if (!ids.length) return res.status(400).json({ message: 'Select at least one client' });
  const rows = await db.all('SELECT id,name,mobile FROM leads WHERE id IN (?)', [ids]);
  await db.run('DELETE FROM leads WHERE id IN (?)', [ids]);
  await logActivity(req, 'CLIENT_DELETED', `Deleted ${rows.length} client(s) with call history: ${rows.slice(0, 5).map((r) => r.name).join(', ')}${rows.length > 5 ? '…' : ''}`,
    { details: { clients: rows } });
  res.json({ ok: true, count: rows.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const lead = await db.one(`${BASE} WHERE l.id=?`, [req.params.id]);
  if (!lead || (req.user.role !== 'admin' && lead.executive_id !== req.user.id && !inPool(lead))) return res.status(404).json({ message: 'Client not found' });
  if (req.user.role !== 'admin' && lead.executive_id !== req.user.id) lead.pool_reason = poolReason(lead);
  lead.extra = JSON.parse(lead.extra || '{}');
  lead.calls = await db.all(`SELECT c.*, u.name AS executive_name FROM calls c JOIN users u ON u.id=c.executive_id
    WHERE c.lead_id=? ORDER BY c.started_at DESC`, [lead.id]);
  lead.activity = (await db.all('SELECT id,user_name,user_role,action,summary,details,created_at FROM activity_log WHERE lead_id=? ORDER BY created_at DESC, id DESC LIMIT 100', [lead.id]))
    .map((r) => ({ ...r, details: JSON.parse(r.details || '{}') }));
  res.json(lead);
}));

router.post('/', wrap(async (req, res) => {
  const mobile = normalizePhone(req.body.mobile);
  if (!req.body.name?.trim() || !mobile) return res.status(400).json({ message: 'Valid name and mobile number are required' });
  if (await db.one('SELECT 1 x FROM leads WHERE mobile=?', [mobile])) return res.status(409).json({ message: 'This mobile number already exists' });
  const name = req.body.name.trim().slice(0, 160);
  // Manually added clients go into the same `leads` table as imported ones.
  // An executive keeps the client he adds; a client added by the admin goes to the fresh pool (shared between present executives).
  const own = req.user.role === 'executive';
  const info = await db.run('INSERT INTO leads (name,mobile,source,executive_id,inbox_pinned,inbox_date) VALUES (?,?,?,?,?,?)',
    [name, mobile, 'manual', own ? req.user.id : null, own ? 1 : 0, own ? todayLocal() : null]);
  await logActivity(req, 'CLIENT_CREATED', `Added client ${name} (${mobile})`, { lead: { id: info.insertId, name } });
  if (!own) require('../inbox').distributeFresh().catch(() => {});
  res.status(201).json({ id: info.insertId });
}));

router.patch('/:id', wrap(async (req, res) => {
  const lead = await db.one('SELECT * FROM leads WHERE id=?', [req.params.id]);
  if (!lead) return res.status(404).json({ message: 'Client not found' });
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && lead.executive_id !== req.user.id) return res.status(403).json({ message: 'This client belongs to another executive' });

  const b = req.body;
  const f = {};
  if (b.group_joined !== undefined) f.group_joined = b.group_joined ? 1 : 0;
  if (b.webinar_status !== undefined) {
    if (!WEBINAR.includes(b.webinar_status)) return res.status(400).json({ message: 'Invalid webinar status' });
    f.webinar_status = b.webinar_status;
  }
  if (b.account_status !== undefined) {
    if (!ACCOUNT.includes(b.account_status)) return res.status(400).json({ message: 'Invalid account status' });
    f.account_status = b.account_status;
    if (b.account_status === 'OPENED' && !isAdmin) f.executive_id = req.user.id; // client now belongs to this executive
  }
  if (b.remark !== undefined) f.remark = String(b.remark).slice(0, 2000);
  if (b.name !== undefined && b.name.trim()) f.name = b.name.trim().slice(0, 160);
  if (b.mobile !== undefined) {
    if (!isAdmin) return res.status(403).json({ message: 'Only admin can change the mobile number' });
    const m = normalizePhone(b.mobile);
    if (!m) return res.status(400).json({ message: 'Enter a valid mobile number' });
    if (m !== lead.mobile) {
      if (await db.one('SELECT 1 x FROM leads WHERE mobile=? AND id<>?', [m, lead.id])) return res.status(409).json({ message: 'This mobile number already exists on another client' });
      f.mobile = m;
    }
  }
  if (b.executive_id !== undefined) {
    if (!isAdmin) return res.status(403).json({ message: 'Only admin can reassign' });
    f.executive_id = b.executive_id || null;
    f.inbox_pinned = f.executive_id ? 1 : 0;
    f.inbox_date = f.executive_id ? todayLocal() : null;
  }
  const keys = Object.keys(f);
  if (keys.length) {
    await db.run(`UPDATE leads SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...keys.map((k) => f[k]), lead.id]);
    await logLeadChanges(req, lead, f);
  }
  res.json({ ok: true });
}));

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const lead = await db.one('SELECT id,name,mobile FROM leads WHERE id=?', [req.params.id]);
  if (!lead) return res.status(404).json({ message: 'Client not found' });
  await db.run('DELETE FROM leads WHERE id=?', [lead.id]);
  await logActivity(req, 'CLIENT_DELETED', `Deleted client ${lead.name} (${lead.mobile}) with call history`, { lead });
  res.json({ ok: true });
}));

// Executive: TAKE a client from the shared pool (without calling) - it moves to his own list / Inbox.
router.post('/:id/take', wrap(async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Admin can assign clients from All Clients instead.' });
  const lead = await db.one(`SELECT l.*, u.name AS executive_name FROM leads l LEFT JOIN users u ON u.id=l.executive_id WHERE l.id=?`, [req.params.id]);
  if (!lead) return res.status(404).json({ message: 'Client not found' });
  if (lead.executive_id === req.user.id) return res.status(400).json({ message: 'This client is already yours' });
  if (!inPool(lead)) return res.status(403).json({ message: 'This client is not in the shared pool' });
  if (await db.one('SELECT 1 x FROM calls WHERE lead_id=? AND ended_at IS NULL', [lead.id])) return res.status(409).json({ message: 'Another executive is on a call with this client right now.' });
  // Interested / uncalled-result clients: the 10-day account-opening window starts again from now
  const restart = lead.status === 'INTERESTED' || lead.status === 'NEW';
  await db.run(`UPDATE leads SET executive_id=?, inbox_pinned=1, inbox_date=?${restart ? ', interested_at=?' : ''} WHERE id=?`,
    [req.user.id, todayLocal(), ...(restart ? [nowIso()] : []), lead.id]);
  await logActivity(req, 'CLIENT_TAKEOVER', `${lead.name} — taken (without call) from ${lead.executive_name || 'nobody'} (${String(lead.status).replace('_', ' ').toLowerCase()})`,
    { lead, details: { from: lead.executive_id, status: lead.status, via: 'take' } });
  res.json({ ok: true });
}));

// Executive → executive: hand a client (with a short note) to a colleague. The client lands in his Inbox
// ("Shared with me") and stays with him — the daily distribution never moves it.
router.post('/:id/share', wrap(async (req, res) => {
  const lead = await db.one('SELECT * FROM leads WHERE id=?', [req.params.id]);
  if (!lead) return res.status(404).json({ message: 'Client not found' });
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && lead.executive_id !== req.user.id) return res.status(403).json({ message: 'You can only share your own clients' });
  if (!isAdmin && lead.account_status === 'OPENED') return res.status(403).json({ message: 'Account is opened — this client is locked to you' });
  if (await db.one('SELECT 1 x FROM calls WHERE lead_id=? AND ended_at IS NULL', [lead.id])) return res.status(409).json({ message: 'A call with this client is running — finish it first' });
  const to = await db.one("SELECT id,name FROM users WHERE id=? AND role='executive' AND active=1", [req.body.to_executive_id]);
  if (!to) return res.status(400).json({ message: 'Choose an executive' });
  if (to.id === lead.executive_id) return res.status(400).json({ message: 'This client already belongs to that executive' });
  const note = String(req.body.note || '').trim().slice(0, 300);
  const from = lead.executive_id ? await db.one('SELECT name FROM users WHERE id=?', [lead.executive_id]) : null;
  await db.run('UPDATE leads SET executive_id=?, inbox_pinned=1, inbox_date=?, shared_from=?, shared_at=?, shared_note=? WHERE id=?',
    [to.id, todayLocal(), req.user.id, nowIso(), note || null, lead.id]);
  await db.run('INSERT INTO lead_shares (lead_id, from_user_id, to_user_id, note) VALUES (?,?,?,?)', [lead.id, req.user.id, to.id, note || null]);
  await logActivity(req, 'CLIENT_SHARED', `${lead.name} — shared ${from ? from.name : req.user.name} → ${to.name}${note ? ` ("${note}")` : ''}`,
    { lead, details: { from: lead.executive_id, to: to.id, note } });
  res.json({ ok: true, to: to.name });
}));

module.exports = router;
