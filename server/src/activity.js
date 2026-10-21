const db = require('./db');

// action -> { label, group }.  Groups are used by the Activity Log filter.
const ACTIONS = {
  LOGIN: { label: 'Signed in', group: 'login' },
  LOGIN_FAILED: { label: 'Failed sign-in', group: 'login' },
  LOGOUT: { label: 'Signed out', group: 'login' },
  PASSWORD_CHANGED: { label: 'Password changed', group: 'login' },
  PHONE_CHANGED: { label: 'Login number changed', group: 'login' },
  CALL_START: { label: 'Call started', group: 'calls' },
  CALL_HANGUP: { label: 'Call ended', group: 'calls' },
  CALL_CANCELLED: { label: 'Call cancelled', group: 'calls' },
  CALL_SAVED: { label: 'Call result saved', group: 'calls' },
  CLIENT_TAKEOVER: { label: 'Took over client', group: 'clients' },
  CLIENT_CREATED: { label: 'Client added', group: 'clients' },
  CLIENT_UPDATED: { label: 'Client updated', group: 'clients' },
  REMARK_UPDATED: { label: 'Remark edited', group: 'clients' },
  CLIENT_ASSIGNED: { label: 'Client assigned', group: 'clients' },
  CLIENT_DELETED: { label: 'Client deleted', group: 'clients' },
  CLIENT_SHARED: { label: 'Client shared', group: 'clients' },
  INBOX_DISTRIBUTED: { label: 'Fresh clients distributed', group: 'admin' },
  ATTENDANCE_SET: { label: 'Attendance changed', group: 'admin' },
  OTP_REQUESTED: { label: 'Login OTP requested', group: 'login' },
  DEVICE_TRUSTED: { label: 'New device verified', group: 'login' },
  DEVICE_REVOKED: { label: 'Devices removed', group: 'admin' },
  IMPORT: { label: 'Leads imported', group: 'admin' },
  USER_CREATED: { label: 'User created', group: 'admin' },
  USER_UPDATED: { label: 'User updated', group: 'admin' },
  SETTINGS_UPDATED: { label: 'Settings changed', group: 'admin' },
};
const GROUPS = {};
for (const [k, v] of Object.entries(ACTIONS)) (GROUPS[v.group] ||= []).push(k);

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().replace('::ffff:', '');

/**
 * await logActivity(req, 'CALL_SAVED', 'Saved call …', { lead, details, user })
 * Never throws — a logging problem must not break the real action.
 */
async function logActivity(req, action, summary, { lead, details, user } = {}) {
  try {
    const u = user || req.user || {};
    await db.run(`INSERT INTO activity_log (user_id,user_name,user_role,action,lead_id,lead_name,summary,details,ip,user_agent)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [u.id ?? null, u.name ?? null, u.role ?? null, action, lead?.id ?? null, lead?.name ?? null,
      String(summary).slice(0, 590), JSON.stringify(details || {}), clientIp(req).slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 250)]);
  } catch (e) { console.warn('activity log failed:', e.message); }
}

module.exports = { logActivity, ACTIONS, GROUPS };
