import { useEffect, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Outcome, Pagination, Spinner, Empty } from '../components/ui';
import LeadDrawer from '../components/LeadDrawer';
import { fmtDateTime, fmtDuration, OUTCOMES, ymd } from '../utils';

const LIMIT = 20;

export default function History() {
  const { isAdmin } = useAuth();
  const { tick } = useDialer();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [execs, setExecs] = useState([]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ search: '', executive: '', outcome: '', from: ymd(new Date(Date.now() - 6 * 86400000)), to: ymd() });

  useEffect(() => { if (isAdmin) api.get('/users').then((r) => setExecs(r.data.filter((u) => u.role === 'executive'))); }, [isAdmin]);
  useEffect(() => { const t = setTimeout(() => { setF((x) => ({ ...x, search: q })); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => {
    api.get('/calls', { params: { ...f, page, limit: LIMIT } }).then((r) => setData(r.data)).catch((e) => toast(errMsg(e), 'err'));
  }, [f, page, toast]);
  useEffect(() => { load(); }, [load, tick]);

  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const s = data?.summary;

  return (
    <>
      <PageHeader title="Call History" subtitle={isAdmin ? 'Every call made by every executive.' : 'All the calls you made.'} />
      <section className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Calls" value={s?.calls ?? '–'} />
        <Kpi label="Connected" value={s?.connected ?? '–'} tone="green" />
        <Kpi label="Total talk time" value={s ? fmtDuration(s.talk_sec) : '–'} />
        <Kpi label="Avg. per call" value={s && s.calls ? fmtDuration(s.talk_sec / s.calls) : '–'} />
      </section>

      <section className="card overflow-hidden">
        <div className="grid grid-cols-2 gap-2 border-b border-border-subtle p-4 lg:grid-cols-6">
          <input className="input col-span-2" placeholder="Search client…" value={q} onChange={(e) => setQ(e.target.value)} />
          {isAdmin && (
            <select className="input" value={f.executive} onChange={(e) => set('executive', e.target.value)}>
              <option value="">All executives</option>{execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <select className="input" value={f.outcome} onChange={(e) => set('outcome', e.target.value)}>
            <option value="">All results</option>{OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}<option value="NONE">No result entered</option>
          </select>
          <input type="date" className="input" value={f.from} max={f.to} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
          <input type="date" className="input" value={f.to} min={f.from} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
        </div>

        {!data ? <Spinner /> : data.data.length === 0 ? <Empty>No calls in this period.</Empty> : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead><tr>{['Date & time', 'Client', 'Mobile', ...(isAdmin ? ['Executive'] : []), 'Duration', 'Result', 'Remark'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>
                  {data.data.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-0/60">
                      <td className="td whitespace-nowrap">{fmtDateTime(c.started_at)}</td>
                      <td className="td whitespace-nowrap"><button className="font-semibold hover:text-signal-greenDark hover:underline" onClick={() => setOpen(c.lead_id)}>{c.lead_name}</button></td>
                      <td className="td mono-num whitespace-nowrap">{c.lead_mobile}</td>
                      {isAdmin && <td className="td whitespace-nowrap">{c.executive_name}</td>}
                      <td className="td mono-num whitespace-nowrap font-semibold">{fmtDuration(c.duration_sec)}</td>
                      <td className="td whitespace-nowrap"><Outcome v={c.outcome} /></td>
                      <td className="td max-w-[320px]"><div className="line-clamp-2">{c.remark || <span className="text-[#a9b0c6]">—</span>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border-subtle md:hidden">
              {data.data.map((c) => (
                <li key={c.id} className="space-y-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button className="text-left font-semibold" onClick={() => setOpen(c.lead_id)}>{c.lead_name}</button>
                    <Outcome v={c.outcome} />
                  </div>
                  <div className="text-xs text-ink-500"><span className="mono-num">{c.lead_mobile}</span> · {fmtDateTime(c.started_at)} · <b className="mono-num">{fmtDuration(c.duration_sec)}</b>{isAdmin && ` · ${c.executive_name}`}</div>
                  {c.remark && <p className="text-[13px] text-ink-700">{c.remark}</p>}
                </li>
              ))}
            </ul>
            <Pagination page={page} total={data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </section>
      {open && <LeadDrawer leadId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
