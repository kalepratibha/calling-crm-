// "Dial on my phone": the executive opens the CRM on his mobile (Phone mode) and logs in with the SAME
// mobile number / password as on the PC. Pressing Call on the PC sends the number here; the phone picks it up
// and opens its own dial pad. When the executive comes back from the dialer after the call, the phone tells
// the server "call finished" and the PC shows the "Call ended" pop-up with the duration.
const router = require('express').Router();
const os = require('os');
const db = require('../db');
const { wrap } = require('../util');
const { PORT } = require('../config');
const { hangupCall } = require('../hangup');

const dials = new Map();   // userId -> { id, number, name, at }
const phones = new Map();  // userId -> last time a phone polled
// Start from the clock (not 0) so ids stay increasing even after the server is restarted
let seq = Date.now();

const phoneOnline = (uid) => Date.now() - (phones.get(uid) || 0) < 6000;

router.post('/dial', wrap((req, res) => {
  const number = String(req.body.number || '').replace(/[^\d+]/g, '');
  if (!number) return res.status(400).json({ message: 'Number missing' });
  dials.set(req.user.id, { id: ++seq, number, name: String(req.body.name || '').slice(0, 120), at: Date.now(), delivered: false });
  res.json({ id: seq, phoneOnline: phoneOnline(req.user.id) });
}));

// Addresses the phone can open (same Wi-Fi as this server)
router.get('/info', (req, res) => {
  const urls = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${PORT}`);
  res.json({ urls });
});

router.get('/status', (req, res) => res.json({ phoneOnline: phoneOnline(req.user.id) }));

// Called every second by the phone page. A number is handed over once; if the phone page was not open yet,
// the number waits (up to 90 seconds) and is delivered the moment the phone page opens.
router.get('/poll', (req, res) => {
  phones.set(req.user.id, Date.now());
  const d = dials.get(req.user.id);
  const fresh = d && !d.delivered && d.id > Number(req.query.after || 0) && Date.now() - d.at < 90000;
  if (fresh) d.delivered = true;
  res.json({ dial: fresh ? d : null, latest: d?.id || 0 });
});

// Light check used by ANY CRM page that is open on a mobile: "did the PC just press Call?" It does not hand the number over
// (that is /poll on the Phone Mode page) - it only tells the page to open Phone Mode by itself. It also counts as "phone online".
router.get('/pending', (req, res) => {
  phones.set(req.user.id, Date.now());
  const d = dials.get(req.user.id);
  res.json({ pending: !!(d && !d.delivered && Date.now() - d.at < 90000) });
});

const openCall = (uid) => db.one('SELECT * FROM calls WHERE executive_id=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [uid]);

// The phone measures when the event really happened and sends "ago_ms" (how long ago, at the moment of sending).
// So slow Wi-Fi / retries never change the duration. Clamped to 0..10 minutes.
const momentFrom = (req) => {
  const ago = Math.min(Math.max(Number(req.body?.ago_ms) || 0, 0), 10 * 60_000);
  return new Date(Date.now() - ago).toISOString();
};

// Phone: the call was really dialed (OFFHOOK) -> the timer restarts from that exact moment
router.post('/dialing', wrap(async (req, res) => {
  const call = await openCall(req.user.id);
  if (call && !call.hangup_at) {
    await db.run('UPDATE calls SET started_at=? WHERE id=?', [momentFrom(req), call.id]);
  }
  res.json({ ok: true, call: !!call });
}));

// Phone: the executive is back from the dial pad (call finished) -> stop the timer, PC pops up
router.post('/ended', wrap(async (req, res) => {
  const call = await openCall(req.user.id);
  if (!call) return res.json({ ok: true, call: false });
  const r = await hangupCall(req, call, 'phone', momentFrom(req),
    req.body?.talk_sec === undefined || req.body?.talk_sec === null ? null : Math.min(Math.max(Number(req.body.talk_sec), 0), 6 * 3600));
  res.json({ ok: true, call: true, duration_sec: r.duration_sec });
}));

module.exports = router;
