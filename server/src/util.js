const { TZ } = require('./config');

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });

const localDate = (iso) => dateFmt.format(new Date(iso));          // YYYY-MM-DD in app timezone
const localHour = (iso) => Number(hourFmt.format(new Date(iso))) % 24;
const todayLocal = () => localDate(new Date().toISOString());
const nowIso = () => new Date().toISOString();

// Normalise phone numbers: "p:+91 98765-43210" -> "9876543210"
function normalizePhone(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

// Start of a local (app timezone) day as a UTC ISO string, e.g. dayStartIso('2026-10-05')
function tzOffsetMs(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const g = (t) => Number(parts.find((x) => x.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(date.getTime() / 1000) * 1000;
}
const dayStartIso = (ymd) => { const n = Date.parse(ymd + 'T00:00:00Z'); return new Date(n - tzOffsetMs(new Date(n))).toISOString(); };
const nextDayIso = (ymd) => dayStartIso(new Date(Date.parse(ymd + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10));
const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec || 0)); const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`; };

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { dayStartIso, nextDayIso, fmtDur, localDate, localHour, todayLocal, nowIso, normalizePhone, wrap };
