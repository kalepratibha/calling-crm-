const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../auth');
const { wrap } = require('../util');
const { logActivity } = require('../activity');

// '' -> null, "https://..." -> itself, anything else -> false (invalid)
const cleanLink = (v) => { const t = String(v ?? '').trim(); if (!t) return null; return /^https?:\/\/\S+$/i.test(t) && t.length <= 500 ? t : false; };

// Everybody logged in can list people (needed for filters); only admin can change.
router.get('/', wrap(async (req, res) => {
  res.json(await db.all(`SELECT id,name,phone,role,active,zoom_link,created_at,last_login_at,
    (SELECT MAX(created_at) FROM activity_log a WHERE a.user_id=users.id AND a.action <> 'LOGIN_FAILED') AS last_activity_at
    , (SELECT COUNT(*) FROM trusted_devices d WHERE d.user_id=users.id) AS devices
    FROM users ORDER BY role, name`));
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const { phone, password, role } = req.body;
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  const p = String(phone || '').replace(/\D/g, '');
  if (!name || p.length < 8) return res.status(400).json({ message: 'Name and valid mobile number are required' });
  if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await db.one('SELECT 1 x FROM users WHERE phone=?', [p])) return res.status(409).json({ message: 'This mobile number is already registered' });
  if (await db.one('SELECT 1 x FROM users WHERE name=?', [name])) return res.status(409).json({ message: 'An executive with this name already exists — use a different (unique) name' });
  const r = role === 'admin' ? 'admin' : 'executive';
  const zoom = cleanLink(req.body.zoom_link);
  if (zoom === false) return res.status(400).json({ message: 'Zoom link must start with https://' });
  const info = await db.run('INSERT INTO users (name,phone,password_hash,role,zoom_link) VALUES (?,?,?,?,?)', [name, p, bcrypt.hashSync(password, 10), r, zoom]);
  await logActivity(req, 'USER_CREATED', `Created ${r} login for ${name} (${p})`, { details: { user_id: info.insertId, role: r } });
  res.status(201).json({ id: info.insertId });
}));

router.put('/:id', requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.one('SELECT * FROM users WHERE id=?', [id]);
  if (!u) return res.status(404).json({ message: 'Not found' });
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ') || u.name;
  if (name !== u.name && await db.one('SELECT 1 x FROM users WHERE name=? AND id<>?', [name, id])) return res.status(409).json({ message: 'An executive with this name already exists — use a different (unique) name' });
  const active = req.body.active === undefined ? u.active : (req.body.active ? 1 : 0);
  if (id === req.user.id && !active) return res.status(400).json({ message: 'You cannot disable yourself' });
  let phone = u.phone;
  if (req.body.phone !== undefined) {
    phone = String(req.body.phone).replace(/\D/g, '');
    if (phone.length < 8 || phone.length > 15) return res.status(400).json({ message: 'Enter a valid mobile number' });
    if (phone !== u.phone && await db.one('SELECT 1 x FROM users WHERE phone=? AND id<>?', [phone, id])) return res.status(409).json({ message: 'This mobile number is already registered' });
  }
  if (req.body.password && String(req.body.password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  const hash = req.body.password ? bcrypt.hashSync(req.body.password, 10) : u.password_hash;
  if (req.body.password) await db.run('DELETE FROM trusted_devices WHERE user_id=?', [id]);   // new password -> OTP again on every PC
  let zoom = u.zoom_link;
  if (req.body.zoom_link !== undefined) {
    zoom = cleanLink(req.body.zoom_link);
    if (zoom === false) return res.status(400).json({ message: 'Zoom link must start with https://' });
  }
  await db.run('UPDATE users SET name=?, phone=?, active=?, password_hash=?, zoom_link=? WHERE id=?', [name, phone, active, hash, zoom, id]);
  const what = [];
  if (name !== u.name) what.push(`name "${u.name}" → "${name}"`);
  if (phone !== u.phone) what.push(`login number ${u.phone} → ${phone}`);
  if (active !== u.active) what.push(active ? 'account enabled' : 'account disabled');
  if (req.body.password) what.push('password reset');
  if ((zoom || '') !== (u.zoom_link || '')) what.push(zoom ? 'Zoom link updated' : 'Zoom link removed');
  if (what.length) await logActivity(req, 'USER_UPDATED', `${u.name}: ${what.join(', ')}`, { details: { user_id: id } });
  res.json({ ok: true });
}));

// Verified PCs / browsers / phones of one user (admin). Removing one makes the next sign-in there ask for an OTP again.
router.get('/:id/devices', requireAdmin, wrap(async (req, res) => {
  res.json(await db.all('SELECT id,label,ip,created_at,last_used_at FROM trusted_devices WHERE user_id=? ORDER BY last_used_at DESC, id DESC', [req.params.id]));
}));
router.delete('/:id/devices', requireAdmin, wrap(async (req, res) => {
  const u = await db.one('SELECT name FROM users WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).json({ message: 'Not found' });
  const dev = Number(req.query.device) || 0;
  const r = dev ? await db.run('DELETE FROM trusted_devices WHERE user_id=? AND id=?', [req.params.id, dev]) : await db.run('DELETE FROM trusted_devices WHERE user_id=?', [req.params.id]);
  await logActivity(req, 'DEVICE_REVOKED', `${u.name}: ${dev ? '1 device' : 'all devices'} removed — OTP needed again on next sign-in`, { details: { user_id: Number(req.params.id), removed: r.affectedRows } });
  res.json({ ok: true, removed: r.affectedRows });
}));

module.exports = router;
