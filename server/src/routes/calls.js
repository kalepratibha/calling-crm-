const router = require('express').Router();
const db = require('../db');
const { wrap, nowIso, localDate, fmtDur, todayLocal, nextDayIso } = require('../util');
const { logActivity } = require('../activity');
const { hangupCall } = require('../hangup');
const { inPool } = require('../pool');

const OUTCOMES = ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK', 'NO_ANSWER'];
const CONNECTED = ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK'];
const WEBINAR = ['PENDING', 'REGISTERED', 'ATTENDED', 'NOT_ATTENDED'];
const ACCOUNT = ['NOT_OPENED', 'IN_PROGRESS', 'OPENED'];

const callWithLead = (id, exec = db) => exec.one(`
  SELECT c.*, l.name AS lead_name, l.mobile AS lead_mobile, l.status AS lead_status, l.call_count AS lead_call_count,
         l.group_joined, l.webinar_status, l.account_status, l.remark AS lead_remark
  FROM calls c JOIN leads l ON l.id=c.lead_id WHERE c.id=?`, [id]);

// Resume a call that is still open (e.g. page refreshed during a call)
router.get('/active', wrap(async (req, res) => {
  const c = await db.one('SELECT id FROM calls WHERE executive_id=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id]);
  res.json({ call: c ? await callWithLead(c.id) : null, serverNow: nowIso() });
}));

router.post('/start', wrap(async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ message: 'Calling is done from the Executive panel. Admins monitor the team.' });
  const open = await db.one('SELECT id FROM calls WHERE executive_id=? AND ended_at IS NULL', [req.user.id]);
  if (open) return res.status(409).json({ code: 'OPEN_CALL', message: 'Finish your current call first', call: await callWithLead(open.id), serverNow: nowIso() });

  const lead = await db.one(`SELECT l.*, u.name AS executive_name FROM leads l LEFT JOIN users u ON u.id=l.executive_id WHERE l.id=?`, [req.body.lead_id]);
  if (!lead) return res.status(404).json({ message: 'Client not found' });

  // An executive can call his OWN clients, and the clients in the shared pool (everybody's Call back / Not pickup clients and
  // Interested clients whose account was not opened in 10 days). Calling a pool client takes it over.
  // Another executive's fresh / other clients cannot be called.
  const takeover = lead.executive_id !== req.user.id;
  if (takeover && !inPool(lead)) {
    return res.status(403).json({ code: 'NOT_YOURS', message: lead.executive_id ? 'This client belongs to another executive.' : 'This client is not assigned to you.' });
  }
  if (takeover && await db.one('SELECT 1 x FROM calls WHERE lead_id=? AND ended_at IS NULL', [lead.id])) {
    return res.status(409).json({ code: 'BUSY', message: 'Another executive is on a call with this client right now.' });
  }
  const started = nowIso();
  const info = await db.run('INSERT INTO calls (lead_id, executive_id, started_at) VALUES (?,?,?)', [lead.id, req.user.id, started]);
  // taking over restarts the 10-day account-opening window (it is set again when this call's result is saved)
  await db.run(`UPDATE leads SET executive_id=?, inbox_pinned=1${takeover ? ', interested_at=NULL' : ''} WHERE id=?`, [req.user.id, lead.id]);
  if (takeover) await logActivity(req, 'CLIENT_TAKEOVER', `${lead.name} — taken over from ${lead.executive_name || 'nobody'} (${String(lead.status).replace('_', ' ').toLowerCase()})`,
    { lead, details: { from: lead.executive_id, status: lead.status } });
  await logActivity(req, 'CALL_START', `Started call to ${lead.name} (${lead.mobile}) — attempt #${lead.call_count + 1}`, { lead, details: { call_id: info.insertId } });
  res.status(201).json({ call: await callWithLead(info.insertId), serverNow: started });
}));

// Save the call. Result and remark are OPTIONAL — an executive may close the pop-up without filling anything.
router.post('/:id/end', wrap(async (req, res) => {
  const call = await db.one('SELECT * FROM calls WHERE id=?', [req.params.id]);
  if (!call || call.executive_id !== req.user.id) return res.status(404).json({ message: 'Call not found' });
  if (call.ended_at) return res.status(400).json({ message: 'Call already saved' });

  const b = req.body || {};
  let outcome = b.outcome || null;
  if (outcome && !OUTCOMES.includes(outcome)) return res.status(400).json({ message: 'Invalid call result' });
  const remark = String(b.remark || '').trim().slice(0, 2000);
  let followup = null;
  if (outcome === 'CALLBACK') {
    if (!b.followup_at || Number.isNaN(Date.parse(b.followup_at))) return res.status(400).json({ message: 'Select the call-back date & time' });
    followup = new Date(b.followup_at).toISOString();
  }
  if (b.webinar_status && !WEBINAR.includes(b.webinar_status)) return res.status(400).json({ message: 'Invalid webinar status' });
  if (b.account_status && !ACCOUNT.includes(b.account_status)) return res.status(400).json({ message: 'Invalid account status' });

  const before = await db.one('SELECT id,name,mobile,group_joined,webinar_status,account_status,status,interested_at FROM leads WHERE id=?', [call.lead_id]);
  const lead = before;

  // The client did not respond / the executive entered no result on a fresh client -> straight into Call back (tomorrow 11:00),
  // so it shows in everybody's All Clients. A client that already has a result (Interested, Not interested, Call back, Not pickup) keeps it.
  let autoCallback = false;
  if (!outcome && lead.status === 'NEW') {
    outcome = 'CALLBACK'; autoCallback = true;
    followup = new Date(Date.parse(nextDayIso(todayLocal())) + 11 * 3600000).toISOString();
  }

  // Duration is always measured by the server -> executives cannot edit it
  const ended = nowIso();
  const stop = call.hangup_at || ended;
  const duration = Math.max(0, Math.round((Date.parse(stop) - Date.parse(call.started_at)) / 1000));

  const callCount = await db.tx(async (t) => {
    await t.run('UPDATE calls SET ended_at=?, duration_sec=?, outcome=?, remark=? WHERE id=?', [ended, duration, outcome, remark, call.id]);
    const { c } = await t.one('SELECT COUNT(*) c FROM calls WHERE lead_id=? AND ended_at IS NOT NULL', [call.lead_id]);
    const f = { call_count: c, last_called_at: ended };
    if (outcome) {
      f.status = outcome; f.followup_at = followup;
      // start of the 10-day "account must be opened" window; any other result clears it
      if (outcome !== 'INTERESTED') f.interested_at = null;
      else if (!lead.interested_at || lead.status !== 'INTERESTED') f.interested_at = ended;
    }
    if (remark) f.remark = remark;
    if (b.group_joined !== undefined) f.group_joined = b.group_joined ? 1 : 0;
    if (b.webinar_status) f.webinar_status = b.webinar_status;
    if (b.account_status) {
      f.account_status = b.account_status;
      if (b.account_status === 'OPENED') f.executive_id = req.user.id; // locks the client to this executive
    }
    const keys = Object.keys(f);
    await t.run(`UPDATE leads SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, [...keys.map((k) => f[k]), call.lead_id]);
    return c;
  });

  const changes = {};
  if (b.group_joined !== undefined && (b.group_joined ? 1 : 0) !== before.group_joined) changes.group_joined = [before.group_joined, b.group_joined ? 1 : 0];
  if (b.webinar_status && b.webinar_status !== before.webinar_status) changes.webinar_status = [before.webinar_status, b.webinar_status];
  if (b.account_status && b.account_status !== before.account_status) changes.account_status = [before.account_status, b.account_status];
  const extra = Object.keys(changes).length ? ' · ' + Object.entries(changes).map(([k, [o, n]]) => `${k.replace('_status', '').replace('_', ' ')}: ${String(o)} → ${String(n)}`).join(', ') : '';
  await logActivity(req, 'CALL_SAVED', `${before.name} — ${outcome ? outcome.replace('_', ' ') : 'no result entered'}${autoCallback ? ' (auto: no response)' : ''} · ${fmtDur(duration)}${extra}`, {
    lead: before, details: { call_id: call.id, outcome, duration_sec: duration, remark, followup_at: followup, changes, auto_callback: autoCallback },
  });
  res.json({ ok: true, duration, call_count: callCount, auto_callback: autoCallback });
}));

// Executive presses "End call": the timer stops here (server time). Duration is locked from now on.
router.post('/:id/hangup', wrap(async (req, res) => {
  const call = await db.one('SELECT * FROM calls WHERE id=?', [req.params.id]);
  if (!call || call.executive_id !== req.user.id || call.ended_at) return res.status(404).json({ message: 'Call not found' });
  res.json(await hangupCall(req, call, 'pc'));
}));

// Mis-click protection: a call cancelled within 5 seconds is deleted and not counted
router.delete('/:id', wrap(async (req, res) => {
  const call = await db.one('SELECT * FROM calls WHERE id=?', [req.params.id]);
  if (!call || call.executive_id !== req.user.id || call.ended_at || call.hangup_at) return res.status(404).json({ message: 'Call not found' });
  if (Date.now() - Date.parse(call.started_at) > 5000) return res.status(400).json({ message: 'Call is running — end it and save the result' });
  await db.run('DELETE FROM calls WHERE id=?', [call.id]);
  const lead = await db.one('SELECT id,name FROM leads WHERE id=?', [call.lead_id]);
  await logActivity(req, 'CALL_CANCELLED', `Cancelled call to ${lead?.name} within 5 seconds (not counted)`, { lead });
  res.json({ ok: true });
}));

// Call history (admin sees everyone, executive sees own)
router.get('/', wrap(async (req, res) => {
  const w = ['c.ended_at IS NOT NULL'], p = [];
  if (req.user.role !== 'admin') { w.push('c.executive_id=?'); p.push(req.user.id); }
  else if (req.query.executive) { w.push('c.executive_id=?'); p.push(Number(req.query.executive)); }
  if (req.query.outcome === 'NONE') w.push('c.outcome IS NULL');
  else if (req.query.outcome) { w.push('c.outcome=?'); p.push(req.query.outcome); }
  if (req.query.lead_id) { w.push('c.lead_id=?'); p.push(Number(req.query.lead_id)); }
  if (req.query.search) { w.push('(l.name LIKE ? OR l.mobile LIKE ?)'); p.push(`%${req.query.search}%`, `%${req.query.search}%`); }
  // date filters are YYYY-MM-DD in app timezone; pad by a day then trim precisely below
  const from = req.query.from, to = req.query.to;
  if (from) { w.push('c.started_at >= ?'); p.push(new Date(Date.parse(from) - 86400000).toISOString()); }
  if (to) { w.push('c.started_at <= ?'); p.push(new Date(Date.parse(to) + 2 * 86400000).toISOString()); }

  let rows = await db.all(`SELECT c.*, l.name AS lead_name, l.mobile AS lead_mobile, u.name AS executive_name
    FROM calls c JOIN leads l ON l.id=c.lead_id JOIN users u ON u.id=c.executive_id
    WHERE ${w.join(' AND ')} ORDER BY c.started_at DESC`, p);
  if (from) rows = rows.filter((r) => localDate(r.started_at) >= from);
  if (to) rows = rows.filter((r) => localDate(r.started_at) <= to);

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const summary = {
    calls: rows.length,
    talk_sec: rows.reduce((s, r) => s + r.duration_sec, 0),
    connected: rows.filter((r) => CONNECTED.includes(r.outcome)).length,
  };
  res.json({ data: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit, summary });
}));

module.exports = router;
