// "Shared pool" = clients that EVERY executive can see in All Clients and call (the caller then takes the client over):
//   * Call back          - any client whose last result is "Call back later"
//   * Not pickup         - any client whose last result is "No answer / busy"
//   * Not interested     - only if POOL_INCLUDE_NOT_INTERESTED=true in server/.env (default: false - stays with its own executive)
//   * 10-day return      - an Interested (or called-but-no-result) client whose account is still NOT opened
//                          POOL_RETURN_DAYS (10) days after the interest / last call
// Never in the pool: fresh / imported clients (never called) and Interested clients (until the 10 days pass) - only their own executive sees them; Account opened.
const { POOL_RETURN_DAYS, POOL_INCLUDE_NOT_INTERESTED } = require('./config');

const cutoffIso = () => new Date(Date.now() - POOL_RETURN_DAYS * 86400000).toISOString();

// SQL condition for table alias l (one "?" = the cut-off timestamp, see poolParams)
const SHARED_STATUSES = POOL_INCLUDE_NOT_INTERESTED ? ['CALLBACK', 'NO_ANSWER', 'NOT_INTERESTED'] : ['CALLBACK', 'NO_ANSWER'];
const POOL_SQL = `(l.account_status <> 'OPENED' AND l.call_count >= 1 AND (
    l.status IN (${SHARED_STATUSES.map((x) => `'${x}'`).join(',')})
    OR (l.status IN ('INTERESTED','NEW') AND COALESCE(l.interested_at, l.last_called_at) <= ?)))`;

// Same rule in JavaScript for one lead row
function inPool(l) {
  if (!l || l.account_status === 'OPENED' || !(l.call_count >= 1)) return false;
  if (SHARED_STATUSES.includes(l.status)) return true;
  if (l.status === 'INTERESTED' || l.status === 'NEW') {
    const t = l.interested_at || l.last_called_at;
    return !!t && Date.parse(t) <= Date.parse(cutoffIso());
  }
  return false;
}

// Why is a client of another executive visible to me?  (SQL expression, alias l; one "?" = cut-off)
const POOL_REASON_SQL = `CASE WHEN l.status='CALLBACK' THEN 'CALLBACK' WHEN l.status='NO_ANSWER' THEN 'NO_ANSWER' WHEN l.status='NOT_INTERESTED' THEN 'NOT_INTERESTED' ELSE 'EXPIRED' END`;

// Same as POOL_REASON_SQL, for one lead row
const poolReason = (l) => (SHARED_STATUSES.includes(l.status) ? l.status : 'EXPIRED');

module.exports = { POOL_SQL, POOL_REASON_SQL, cutoffIso, inPool, poolReason, POOL_RETURN_DAYS };
