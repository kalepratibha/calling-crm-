import { useEffect, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Modal, Spinner } from '../components/ui';
import { fmtDateTime } from '../utils';

const META = {
  PRESENT: { short: 'P', name: 'Present', cls: 'bg-signal-greenTint text-signal-greenDark' },
  HALF_DAY: { short: 'H', name: 'Half day', cls: 'bg-amber-tint text-amber-dark' },
  ABSENT: { short: 'A', name: 'Absent', cls: 'bg-coral-tint text-coral' },
  LEAVE: { short: 'L', name: 'On leave', cls: 'bg-sky-tint text-sky' },
  NOT_YET: { short: '…', name: 'Not signed in yet', cls: 'bg-surface-2 text-ink-300' },
  OFF: { short: 'off', name: 'Weekly off', cls: 'bg-surface-0 text-ink-300' },
  '': { short: '', name: '', cls: '' },
};
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
};
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Present / absent status of executives. Admin: everybody (click a day to change it). Executive: own record.
export default function Attendance() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [ym, setYm] = useState('');
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = useCallback((m) => {
    const r = m ? monthRange(m) : {};
    return api.get('/attendance', { params: r }).then((x) => { setD(x.data); if (!m) setYm(x.data.from.slice(0, 7)); }).catch((e) => toast(errMsg(e), 'err'));
  }, [toast]);
  useEffect(() => { load(ym || undefined); }, [ym, load]);
  useEffect(() => { const t = setInterval(() => load(ym || undefined), 60000); return () => clearInterval(t); }, [ym, load]);

  if (!d) return <Spinner />;
  const today = d.today;
  const sum = d.users.reduce((s, u) => { for (const k of ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE']) s[k] += u.summary[k]; return s; }, { PRESENT: 0, HALF_DAY: 0, ABSENT: 0, LEAVE: 0 });
  const todayPresent = d.users.filter((u) => ['PRESENT', 'HALF_DAY'].includes(u.cells[today]?.status)).length;
  const inMonth = today >= d.from && today <= d.to;

  return (
    <>
      <PageHeader title="Attendance" subtitle={isAdmin ? 'An executive is Present for the day as soon as he signs in. You can change any day by clicking it.' : 'Your present / absent record. You are marked Present automatically when you sign in.'}>
        <button className="btn-ghost" onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
        <span className="min-w-[130px] text-center font-display text-sm font-bold">{monthName(ym)}</span>
        <button className="btn-ghost" onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
      </PageHeader>

      <section className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isAdmin && inMonth && <Kpi label="Present today" value={`${todayPresent} / ${d.users.length}`} tone="green" />}
        <Kpi label="Present days" value={sum.PRESENT + sum.HALF_DAY * 0.5} tone="green" hint="half days count 0.5" />
        <Kpi label="Absent days" value={sum.ABSENT} tone={sum.ABSENT ? 'red' : undefined} />
        <Kpi label="Leave days" value={sum.LEAVE} />
      </section>

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-[12px]">
            <thead>
              <tr>
                <th className="th sticky left-0 z-10 text-left">Executive</th>
                {d.days.map((x) => (
                  <th key={x.date} className={`th !px-1 !py-1.5 ${x.date === today ? '!bg-signal-greenTint !text-signal-greenDark' : x.off ? '!text-ink-300' : ''}`}>
                    <div>{Number(x.date.slice(8))}</div><div className="font-semibold normal-case opacity-70">{DOW[x.dow]}</div>
                  </th>
                ))}
                <th className="th">P</th><th className="th">A</th><th className="th">L</th>
              </tr>
            </thead>
            <tbody>
              {d.users.map((u) => (
                <tr key={u.id}>
                  <td className="td sticky left-0 z-10 whitespace-nowrap bg-white text-left font-semibold">{u.name}</td>
                  {d.days.map((x) => {
                    const c = u.cells[x.date]; const m = META[c.status] || META[''];
                    const title = `${u.name} · ${x.date}\n${m.name}${c.auto ? ' (no sign-in)' : ''}${c.first_login_at ? `\nFirst sign-in: ${fmtDateTime(c.first_login_at)}` : ''}${c.note ? `\n${c.note}` : ''}`;
                    return (
                      <td key={x.date} className="td !p-0.5">
                        <button type="button" title={title} disabled={!isAdmin || !c.status && x.date > today}
                          onClick={() => setEdit({ user: u, date: x.date, cell: c })}
                          className={`mono-num h-7 w-full min-w-[26px] rounded text-[11px] font-bold ${m.cls} ${c.manual ? 'ring-1 ring-ink-500' : ''} ${isAdmin ? 'hover:opacity-80' : 'cursor-default'}`}>
                          {m.short}
                        </button>
                      </td>
                    );
                  })}
                  <td className="td mono-num font-bold text-signal-greenDark">{u.summary.PRESENT + u.summary.HALF_DAY * 0.5}</td>
                  <td className="td mono-num font-bold text-coral">{u.summary.ABSENT}</td>
                  <td className="td mono-num">{u.summary.LEAVE}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'NOT_YET', 'OFF'].map((k) => <span key={k} className={`rounded px-2 py-1 font-semibold ${META[k].cls}`}>{META[k].short} = {META[k].name}</span>)}
        <span className="rounded px-2 py-1 font-semibold ring-1 ring-ink-500">outlined = set by admin</span>
      </div>

      {edit && <EditModal e={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(ym || undefined); }} />}
    </>
  );
}

function EditModal({ e, onClose, onDone }) {
  const toast = useToast();
  const [status, setStatus] = useState(['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'].includes(e.cell.status) ? e.cell.status : 'PRESENT');
  const [note, setNote] = useState(e.cell.note || '');
  const [err, setErr] = useState('');
  async function save(st) {
    setErr('');
    try { await api.post('/attendance', { user_id: e.user.id, date: e.date, status: st, note }); toast('Attendance saved'); onDone(); }
    catch (x) { setErr(errMsg(x)); }
  }
  return (
    <Modal title={`${e.user.name} — ${e.date}`} onClose={onClose}>
      <div className="space-y-4">
        {e.cell.first_login_at && <p className="text-sm text-ink-500">First sign-in: <b>{fmtDateTime(e.cell.first_login_at)}</b> · last seen {fmtDateTime(e.cell.last_seen_at)}</p>}
        <div className="grid grid-cols-2 gap-2">
          {['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'].map((k) => (
            <button key={k} type="button" onClick={() => setStatus(k)} className={`rounded-md border-2 px-3 py-2.5 text-sm font-bold ${status === k ? `${META[k].cls} border-ink-700` : 'border-border-subtle bg-white text-ink-500'}`}>{META[k].name}</button>
          ))}
        </div>
        <div><label className="label">Note (optional)</label><input className="input" maxLength={300} value={note} onChange={(x) => setNote(x.target.value)} placeholder="e.g. sick leave" /></div>
        <p className="text-xs text-ink-300">Marking someone Absent / On leave today also takes him out of today's fresh-client distribution.</p>
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => save(null)}>Back to automatic</button>
          <button className="btn-dark flex-1" onClick={() => save(status)}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
