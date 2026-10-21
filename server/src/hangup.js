// Shared "call has ended" logic. Used by the PC "End call" button AND by the phone page
// (when the executive comes back from the phone's dialer after the call).
const db = require('./db');
const { nowIso, fmtDur } = require('./util');
const { logActivity } = require('./activity');

// Stops the timer (server time) and stores the duration straight away,
// so the duration is safe in MySQL even if the PC pop-up is never filled.
async function hangupCall(req, call, source = 'pc', atIso = null, talkSec = null) {
  let hangup = call.hangup_at || atIso || nowIso();
  if (Date.parse(hangup) < Date.parse(call.started_at)) hangup = call.started_at;
  // The phone's own call log knows the exact talk time (from the moment the call was answered).
  // Use it: move started_at so that hangup - started_at == talk time (everything else keeps working).
  if (!call.hangup_at && talkSec !== null && Number.isFinite(talkSec) && talkSec >= 0) {
    call.started_at = new Date(Date.parse(hangup) - Math.round(talkSec) * 1000).toISOString();
    await db.run('UPDATE calls SET started_at=? WHERE id=?', [call.started_at, call.id]);
  }
  const dur = Math.max(0, Math.round((Date.parse(hangup) - Date.parse(call.started_at)) / 1000));
  if (!call.hangup_at) {
    await db.run('UPDATE calls SET hangup_at=?, duration_sec=? WHERE id=? AND ended_at IS NULL', [hangup, dur, call.id]);
    const lead = await db.one('SELECT id,name FROM leads WHERE id=?', [call.lead_id]);
    await logActivity(req, 'CALL_HANGUP', `Ended call with ${lead?.name} after ${fmtDur(dur)}${source === 'phone' ? ' (detected from phone)' : ''}`,
      { lead, details: { call_id: call.id, duration_sec: dur, source } });
  }
  return { hangup_at: hangup, duration_sec: dur };
}

module.exports = { hangupCall };
