import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Pagination, Spinner, Empty } from '../components/ui';
import LeadDrawer from '../components/LeadDrawer';
import { ACTION_META, ACTION_GROUPS, fmtDateTime, ymd } from '../utils';

const LIMIT = 25;

// Admin: every action of every user.  Executive: only his own actions.
export default function ActivityLog() {
  const { isAdmin } = useAuth();
  const { tick } = useDialer();
  const toast = useToast();
  const [sp] = useSearchParams();
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ search: '', user: sp.get('user') || '', group: '', from: ymd(new Date(Date.now() - 6 * 86400000)), to: ymd() });

  useEffect(() => { if (isAdmin) api.get('/users').then((r) => setUsers(r.data)); }, [isAdmin]);
  useEffect(() => { const t = setTimeout(() => { setF((x) => ({ ...x, search: q })); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => {
    api.get('/activity', { params: { ...f, page, limit: LIMIT } }).then((r) => setData(r.data)).catch((e) => toast(errMsg(e), 'err'));
  }, [f, page, toast]);
  useEffect(() => { load(); }, [load, tick]);

  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const g = data?.byGroup || {};

  return (
    <>
      <PageHeader title={isAdmin ? 'Activity Log' : 'My Activity'}
        subtitle={isAdmin ? 'A complete record of what every executive did — calls, remarks, status changes, sign-ins.' : 'A record of everything you did in the CRM.'} />

      <section className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Total activities" value={data?.total ?? '–'} />
        <Kpi label="Call events" value={g.calls || 0} tone="green" />
        <Kpi label="Client changes" value={g.clients || 0} />
        <Kpi label="Sign-ins" value={g.login || 0} />
      </section>

      <section className="card overflow-hidden">
        <div className="grid grid-cols-2 gap-2 border-b border-border-subtle p-4 lg:grid-cols-6">
          <input className="input col-span-2" placeholder="Search client or action…" value={q} onChange={(e) => setQ(e.target.value)} />
          {isAdmin && (
            <select className="input" value={f.user} onChange={(e) => set('user', e.target.value)}>
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role === 'admin' ? ' (admin)' : ''}</option>)}
            </select>
          )}
          <select className="input" value={f.group} onChange={(e) => set('group', e.target.value)}>
            <option value="">All activity</option>
            {ACTION_GROUPS.filter(([k]) => isAdmin || k !== 'admin').map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          <input type="date" className="input" value={f.from} max={f.to} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
          <input type="date" className="input" value={f.to} min={f.from} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
        </div>

        {!data ? <Spinner /> : data.data.length === 0 ? <Empty>No activity in this period.</Empty> : (
          <>
            <ul className="divide-y divide-border-subtle">
              {data.data.map((a) => {
                const m = ACTION_META[a.action] || { label: a.action, tone: 'bg-surface-2 text-ink-700', icon: '•' };
                const remark = a.details?.remark || a.details?.new;
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${m.tone}`}>{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {isAdmin && <b className="text-[13.5px]">{a.user_name || 'System'}</b>}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.tone}`}>{m.label}</span>
                        {a.lead_id && a.action !== 'CLIENT_DELETED' && (
                          <button className="text-[13px] font-semibold text-signal-greenDark hover:underline" onClick={() => setOpen(a.lead_id)}>{a.lead_name}</button>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13.5px] text-ink-800">{a.summary}</p>
                      {remark && <p className="mt-1 rounded-md bg-surface-0 px-3 py-1.5 text-[13px] text-ink-700">“{remark}”</p>}
                      {isAdmin && a.ip && <div className="mt-0.5 text-[11px] text-ink-300">IP {a.ip}</div>}
                    </div>
                    <time className="mono-num shrink-0 whitespace-nowrap text-xs text-ink-300">{fmtDateTime(a.created_at)}</time>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} total={data.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </section>
      {open && <LeadDrawer leadId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
