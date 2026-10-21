// Daily distribution of FRESH clients (never called, nobody owns them) between the executives who are PRESENT today.
//  - BEFORE the cutoff time (12:00): every executive who is not marked absent / on leave shares the clients equally
//  - FROM the cutoff time: only executives who have signed in share them; an absentee's untouched clients go to the present ones
//  - the admin marking someone absent / leave removes him from the distribution immediately
//  - clients that were handed to an absent executive and are still untouched go back into the pool
//  - late joiners get their fair share: executives holding more than their share give the extra back to the pool
//  - clients that were assigned by the admin, shared by an executive, or already called are never moved
const db = require('./db');
const { todayLocal } = require('./util');
const { distributionExecutives } = require('./attendance');
const { logActivity } = require('./activity');

let running = false, again = false;

async function distributeFresh() {
  if (running) { again = true; return { queued: true }; }
  running = true;
  let out;
  try { do { again = false; out = await runOnce(); } while (again); }
  finally { running = false; }
  return out;
}

const chunk = (a, n = 1000) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function runOnce() {
  const today = todayLocal();
  const { list: present, phase } = await distributionExecutives(today);
  const ids = present.map((p) => p.id);
  const { c: unassigned } = await db.one('SELECT COUNT(*) c FROM leads WHERE call_count=0 AND executive_id IS NULL');
  if (!ids.length) return { distributed: 0, present: 0, unassigned, phase };

  const moved = await db.tx(async (t) => {
    // untouched clients that came from the inbox and are held by someone present today
    const held = await t.all(`SELECT id, executive_id FROM leads WHERE inbox_date IS NOT NULL AND inbox_pinned=0 AND call_count=0
      AND account_status!='OPENED' AND executive_id IN (?) ORDER BY id`, [ids]);
    // free pool: nobody's fresh clients + untouched inbox clients of executives who are not present today
    const free = await t.all(`SELECT id FROM leads WHERE call_count=0 AND account_status!='OPENED' AND (executive_id IS NULL
      OR (inbox_date IS NOT NULL AND inbox_pinned=0 AND executive_id NOT IN (?))) ORDER BY id`, [ids]);

    const heldBy = new Map(ids.map((i) => [i, []]));
    held.forEach((h) => heldBy.get(h.executive_id).push(h.id));
    const total = held.length + free.length;
    const base = Math.floor(total / ids.length), extra = total % ids.length;
    // whoever already holds more gets the "+1" so that as few clients as possible change hands
    const order = [...ids].sort((a, b) => heldBy.get(b).length - heldBy.get(a).length);
    const quota = new Map(order.map((id, i) => [id, base + (i < extra ? 1 : 0)]));

    const pool = free.map((f) => f.id);
    for (const id of ids) { const arr = heldBy.get(id), q = quota.get(id); if (arr.length > q) pool.push(...arr.splice(q)); }

    const give = new Map(ids.map((i) => [i, []]));
    const needs = new Map(ids.map((i) => [i, quota.get(i) - heldBy.get(i).length]));
    let guard = pool.length + 1;
    while (pool.length && guard-- > 0) {        // round-robin so everybody gets old and new clients alike
      for (const id of ids) { if (pool.length && needs.get(id) > 0) { give.get(id).push(pool.shift()); needs.set(id, needs.get(id) - 1); } }
    }
    let n = 0;
    for (const [id, list] of give) {
      for (const part of chunk(list)) {
        await t.run('UPDATE leads SET executive_id=?, inbox_date=?, inbox_pinned=0 WHERE id IN (?)', [id, today, part]);
        n += part.length;
      }
    }
    return { n, per: [...give].filter(([, l]) => l.length).map(([id, l]) => `${present.find((p) => p.id === id).name}: +${l.length}`) };
  });

  if (moved.n > 0) {
    await logActivity({ headers: {}, socket: {} }, 'INBOX_DISTRIBUTED',
      `${moved.n} fresh client(s) distributed between ${ids.length} executive(s) (${phase === 'AFTER_CUTOFF' ? 'present only' : 'before cutoff, all expected'}) — ${moved.per.join(', ')}`,
      { user: { id: null, name: 'System', role: 'system' }, details: { moved: moved.n, present: ids, phase } });
  }
  return { distributed: moved.n, present: ids.length, unassigned: 0, phase };
}

module.exports = { distributeFresh };
