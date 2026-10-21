// Daily attendance: an executive is PRESENT for a day as soon as he uses the CRM that day (login or any activity).
// The admin can override (ABSENT / LEAVE / HALF_DAY / PRESENT) — a manual status is never changed automatically.
const db = require('./db');
const { todayLocal, nowIso, localHour } = require('./util');
const { WEEKLY_OFF, DISTRIBUTION_CUTOFF_HOUR } = require('./config');

const STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'];
const WORKING = ['PRESENT', 'HALF_DAY'];   // these get fresh clients

// Creates today's row on the first activity, afterwards only refreshes "last seen". Returns true if newly created.
async function markActive(userId) {
  const now = nowIso();
  const r = await db.run(`INSERT INTO attendance (user_id, work_date, status, first_login_at, last_seen_at) VALUES (?,?,'PRESENT',?,?)
    ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at)`, [userId, todayLocal(), now, now]);
  return r.affectedRows === 1;
}

// Executives who are present today (and enabled)
const presentExecutives = (date = todayLocal()) => db.all(`SELECT u.id, u.name FROM users u
  JOIN attendance a ON a.user_id=u.id AND a.work_date=?
  WHERE u.role='executive' AND u.active=1 AND a.status IN (?) ORDER BY u.id`, [date, WORKING]);

// Is the cutoff time (default 12:00) over for today?  false = morning phase, true = afternoon phase
const afterCutoff = () => localHour(nowIso()) >= DISTRIBUTION_CUTOFF_HOUR;
const isWeeklyOff = (date = todayLocal()) => WEEKLY_OFF.includes(new Date(date + 'T00:00:00Z').getUTCDay());

// Executives who share the fresh clients right now:
//   morning (before cutoff): everybody active who is not marked ABSENT / LEAVE — they are expected to sign in before the cutoff
//   afternoon (from cutoff): only the ones who have signed in (PRESENT / HALF_DAY)
//   weekly-off day: only the ones who have actually signed in
async function distributionExecutives(date = todayLocal()) {
  const rows = await db.all(`SELECT u.id, u.name, a.status AS attendance FROM users u
    LEFT JOIN attendance a ON a.user_id=u.id AND a.work_date=?
    WHERE u.role='executive' AND u.active=1 ORDER BY u.id`, [date]);
  const present = (r) => WORKING.includes(r.attendance);
  const strict = afterCutoff() || isWeeklyOff(date);
  const list = rows.filter((r) => (strict ? present(r) : (present(r) || !r.attendance)));
  return { list, strict, phase: afterCutoff() ? 'AFTER_CUTOFF' : 'BEFORE_CUTOFF', all: rows };
}

module.exports = { STATUSES, WORKING, markActive, presentExecutives, afterCutoff, isWeeklyOff, distributionExecutives };
