// WhatsApp messages sent to the client after a call - one template per call result (Interested / Not interested /
// Call back / No answer). The templates and the common group link are edited by the admin; the Zoom link is
// different for every executive. Placeholders: {name} {executive} {zoom_link} {group_link} {callback_time}
const router = require('express').Router();
const db = require('../db');
const { requireAdmin } = require('../auth');
const { wrap } = require('../util');
const { logActivity } = require('../activity');

const KEYS = ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK', 'NO_ANSWER'];
const DEFAULT_GROUP_LINK = 'https://chat.whatsapp.com/Kqm1l6yYKzI5kmLHgJtF63';
const DEFAULTS = {
  INTERESTED: `Hello {name},

Welcome to ECG Trade!
Thank you for registering for our Gold AI & Algo Trading Free Webinar.

Learn live market analysis, smart trading strategies, and AI & Algo Trading insights.

Please join your official WhatsApp group using the link below.

IMPORTANT INFORMATION SHARED IN GROUP:
- Zoom meeting link
- Webinar Time
- Important event notifications and market news

JOIN YOUR WHATSAPP GROUP:
{group_link}

ZOOM MEETING LINK:
{zoom_link}

My name is {executive}.
Please save my number for any queries or information.

Thank you for joining ECG Trade.`,
  NOT_INTERESTED: `Hello {name},

Thank you for your time. We understand this is not the right time for you.

If you would like to join our Gold AI & Algo Trading Free Webinar in the future, just send me a message here.

Regards,
{executive}
ECG Trade`,
  CALLBACK: `Hello {name},

This is {executive} from ECG Trade. As discussed, I will call you back on {callback_time}.
Please keep a few minutes free for the call.

Thank you,
ECG Trade`,
  NO_ANSWER: `Hello {name},

This is {executive} from ECG Trade. I tried to call you about our Gold AI & Algo Trading Free Webinar but could not reach you.

Please reply here with a good time to talk, or message me your questions.

Thank you,
ECG Trade`,
};

async function loadSettings() {
  const rows = await db.all("SELECT k, v FROM settings WHERE k LIKE 'wa\\_%'");
  const m = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  const templates = {};
  for (const k of KEYS) templates[k] = m[`wa_tpl_${k}`] ?? DEFAULTS[k];
  return { templates, group_link: m.wa_group_link ?? DEFAULT_GROUP_LINK, group_all: (m.wa_group_all ?? '1') !== '0' };
}

// For the executive's "Call ended" pop-up: the templates + his own values
router.get('/templates', wrap(async (req, res) => {
  const s = await loadSettings();
  const me = await db.one('SELECT name, zoom_link FROM users WHERE id=?', [req.user.id]);
  res.json({ templates: s.templates, group_all: s.group_all, vars: { executive: me.name, zoom_link: me.zoom_link || '', group_link: s.group_link } });
}));

// Executive saves his own Zoom link
router.put('/my-zoom', wrap(async (req, res) => {
  const t = String(req.body.zoom_link || '').trim();
  if (t && !/^https?:\/\/\S+$/i.test(t)) return res.status(400).json({ message: 'Zoom link must start with https://' });
  await db.run('UPDATE users SET zoom_link=? WHERE id=?', [t || null, req.user.id]);
  await logActivity(req, 'USER_UPDATED', t ? 'Updated own Zoom link' : 'Removed own Zoom link');
  res.json({ ok: true, zoom_link: t });
}));

// ---- admin: edit the texts -------------------------------------------------------------------------------------
router.get('/admin', requireAdmin, wrap(async (req, res) => {
  const s = await loadSettings();
  const execs = await db.all("SELECT id, name, zoom_link FROM users WHERE role='executive' AND active=1 ORDER BY name");
  res.json({ ...s, defaults: DEFAULTS, default_group_link: DEFAULT_GROUP_LINK, executives: execs });
}));

router.put('/admin', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  const link = String(b.group_link ?? '').trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) return res.status(400).json({ message: 'Group link must start with https://' });
  for (const k of KEYS) {
    const v = String(b.templates?.[k] ?? '').trim();
    if (!v) return res.status(400).json({ message: `The ${k.replace('_', ' ').toLowerCase()} message cannot be empty` });
    if (v.length > 3000) return res.status(400).json({ message: 'A message is too long (max 3000 characters)' });
  }
  const put = (k, v) => db.run('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, v]);
  for (const k of KEYS) await put(`wa_tpl_${k}`, String(b.templates[k]).trim());
  await put('wa_group_link', link);
  await put('wa_group_all', b.group_all === false ? '0' : '1');
  await logActivity(req, 'SETTINGS_UPDATED', 'Edited the WhatsApp message templates / group link');
  res.json({ ok: true });
}));

// Admin: set / change one executive's Zoom link directly from this page
router.put('/admin/zoom/:id', requireAdmin, wrap(async (req, res) => {
  const t = String(req.body.zoom_link || '').trim();
  if (t && !/^https?:\/\/\S+$/i.test(t)) return res.status(400).json({ message: 'Zoom link must start with https://' });
  const u = await db.one("SELECT id, name FROM users WHERE id=? AND role='executive'", [req.params.id]);
  if (!u) return res.status(404).json({ message: 'Executive not found' });
  await db.run('UPDATE users SET zoom_link=? WHERE id=?', [t || null, u.id]);
  await logActivity(req, 'USER_UPDATED', t ? `Zoom link updated for ${u.name}` : `Zoom link removed for ${u.name}`);
  res.json({ ok: true, zoom_link: t });
}));

module.exports = router;
