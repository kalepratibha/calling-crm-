// Optional: fills the database with DEMO executives, clients and calls so you can preview graphs.
// Run:  npm run seed      (do NOT run on your real database)
const bcrypt = require('bcryptjs');
const db = require('./db');

const first = ['Amit','Sneha','Rohan','Priya','Vikas','Neha','Sagar','Pooja','Rahul','Kiran','Anita','Mahesh','Swati','Nilesh','Komal','Ganesh','Rutuja','Omkar','Shweta','Prasad'];
const lastNames = ['Patil','Kulkarni','Jadhav','Deshmukh','Shinde','More','Pawar','Gaikwad','Joshi','Kale'];
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`);
const remarks = { INTERESTED: ['Wants to open account this week', 'Asked for webinar link', 'Interested, send details on WhatsApp'],
  NOT_INTERESTED: ['Not interested right now', 'Already has a broker', 'Wrong lead'], CALLBACK: ['Busy, call in evening', 'Call tomorrow 11 am'], NO_ANSWER: ['Not picked', 'Switched off'] };

(async () => {
  await db.init();
  const execs = ['Rahul Sharma', 'Pooja Mane', 'Sagar Bhosale', 'Neha Joshi', 'Kiran Pawar'];
  const ids = [];
  for (let i = 0; i < execs.length; i++) {
    const phone = `900000010${i}`;
    const ex = await db.one('SELECT id FROM users WHERE phone=?', [phone]);
    ids.push(ex ? ex.id : (await db.run('INSERT INTO users (name,phone,password_hash,role) VALUES (?,?,?,?)', [execs[i], phone, bcrypt.hashSync('demo1234', 10), 'executive'])).insertId);
  }

  for (let i = 0; i < 140; i++) {
    const mobile = String(7000000000 + rnd(2999999999));
    const created = new Date(Date.now() - rnd(12) * 86400000).toISOString();
    const name = `${pick(first)} ${pick(lastNames)}`;
    const r = await db.run('INSERT IGNORE INTO leads (name,mobile,source,extra,created_at) VALUES (?,?,?,?,?)',
      [name, mobile, 'demo', JSON.stringify({ city: pick(['Pune', 'Mumbai', 'Nashik', 'Satara']) }), created]);
    if (!r.affectedRows) continue;
    const leadId = r.insertId;
    const ex = pick(ids), exName = execs[ids.indexOf(ex)];
    const n = rnd(8); // 0..7 calls
    let status = 'NEW', remark = '', last = null;
    for (let c = 0; c < n; c++) {
      const day = new Date(Date.now() - rnd(10) * 86400000);
      day.setUTCHours(0, 0, 0, 0);
      const start = new Date(day.getTime() + (4.5 + Math.random() * 7.9) * 3600000); // 10:00-18:00 IST
      if (start > new Date()) continue;
      const outcome = pick(['INTERESTED', 'NOT_INTERESTED', 'CALLBACK', 'NO_ANSWER', 'NO_ANSWER', 'INTERESTED']);
      const dur = outcome === 'NO_ANSWER' ? rnd(25) : 30 + rnd(420);
      const end = new Date(start.getTime() + dur * 1000);
      remark = pick(remarks[outcome]);
      await db.run('INSERT INTO calls (lead_id,executive_id,started_at,ended_at,duration_sec,outcome,remark) VALUES (?,?,?,?,?,?,?)',
        [leadId, ex, start.toISOString(), end.toISOString(), dur, outcome, remark]);
      await db.run(`INSERT INTO activity_log (user_id,user_name,user_role,action,lead_id,lead_name,summary,details,created_at) VALUES (?,?,'executive',?,?,?,?,?,?)`,
        [ex, exName, 'CALL_START', leadId, name, `Started call to ${name} (${mobile}) — attempt #${c + 1}`, '{}', start.toISOString()]);
      await db.run(`INSERT INTO activity_log (user_id,user_name,user_role,action,lead_id,lead_name,summary,details,created_at) VALUES (?,?,'executive',?,?,?,?,?,?)`,
        [ex, exName, 'CALL_SAVED', leadId, name, `${name} — ${outcome.replace('_', ' ')} · ${fmt(dur)}`, JSON.stringify({ outcome, duration_sec: dur, remark }), end.toISOString()]);
      status = outcome; last = end.toISOString();
    }
    const { c: cnt } = await db.one('SELECT COUNT(*) c FROM calls WHERE lead_id=?', [leadId]);
    const opened = status === 'INTERESTED' && Math.random() < 0.3;
    await db.run('UPDATE leads SET status=?, remark=?, call_count=?, last_called_at=?, executive_id=?, group_joined=?, webinar_status=?, account_status=? WHERE id=?',
      [status, remark, cnt, last, cnt ? ex : null, status === 'INTERESTED' && Math.random() < 0.6 ? 1 : 0,
        status === 'INTERESTED' ? pick(['REGISTERED', 'ATTENDED', 'PENDING']) : 'PENDING', opened ? 'OPENED' : 'NOT_OPENED', leadId]);
  }
  console.log('Demo data added. Executive logins: 9000000100 … 9000000104 / password demo1234');
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
