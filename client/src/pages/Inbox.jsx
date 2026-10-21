import { useEffect, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Badge, CallCount, PhoneIcon, Spinner, Empty, Pagination } from '../components/ui';
import LeadDrawer from '../components/LeadDrawer';
import ShareModal from '../components/ShareModal';
import { fmtDateTime, fmtDate } from '../utils';

const LIMIT = 20;
const TABS = [
  ['work', 'My work list', 'Fresh clients first, then call-backs, then the rest of your clients that still need calls'],
  ['fresh', 'Fresh clients', 'Never called — handed to you by the daily distribution'],
  ['followups', 'Call-backs', 'Call back, Not pickup and Not interested clients — call them again'],
  ['interested', 'Interested', 'Clients who are interested — follow up until the account is opened'],
  ['shared', 'Shared with me', 'Clients another executive passed to you'],
  ['progress', 'In progress', 'Called at least once, still below the call target'],
  ['all', 'All mine', 'Everything that belongs to you'],
];

export default function Inbox() {
  const { startCall, tick, call } = useDialer();
  const toast = useToast();
  const [filter, setFilter] = useState('work');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [sharing, setSharing] = useState(null);

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(() => api.get('/inbox', { params: { filter, page, limit: LIMIT, search } })
    .then((r) => setData(r.data)).catch((e) => toast(errMsg(e), 'err')), [filter, page, search, toast]);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);   // new clients arrive during the day

  // "Call next client" after saving a call → next fresh client (or next call-back when that tab is open)
  const callNext = useCallback(async () => {
    try {
      const { data: r } = await api.get('/inbox', { params: { filter, limit: 1 } });
      if (!r.data.length) { toast('Nothing left in this list — great work!'); return; }
      startCall(r.data[0], { onNext: callNext });
    } catch (e) { toast(errMsg(e), 'err'); }
  }, [filter, startCall, toast]);

  if (!data) return <Spinner />;
  const c = data.counts;
  const tab = TABS.find((t) => t[0] === filter);
  const first = data.data[0];

  return (
    <>
      <PageHeader title="Inbox" subtitle="Fresh clients come first, call-backs and the rest follow below. New clients are shared equally and automatically.">
        <button className="btn-green !py-3" disabled={!first || !!call} onClick={() => startCall(first, { onNext: callNext })}>
          <PhoneIcon /> Start calling {data.total ? `(${data.total})` : ''}
        </button>
      </PageHeader>

      <section className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Fresh clients waiting" value={c.fresh} tone="green" hint={`${data.allotted_today} handed to you today`} />
        <Kpi label="Call-backs due now" value={c.followups_due} tone={c.followups_due ? 'amber' : undefined} hint={`${c.followups} call-back(s) in total`} />
        <Kpi label="Interested" value={c.interested} tone="green" hint="account opening pending" />
        <Kpi label="Shared with me" value={c.shared} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle p-3 sm:p-4">
          {TABS.map(([k, name]) => (
            <button key={k} onClick={() => { setFilter(k); setPage(1); }}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition ${filter === k ? 'border-ink-950 bg-ink-950 text-white' : 'border-border-subtle bg-white text-ink-500 hover:border-border-strong'}`}>
              {name} <span className="mono-num opacity-70">{c[k]}</span>
            </button>
          ))}
          <input className="input ml-auto !w-full sm:!w-56" placeholder="Search name or mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="border-b border-border-subtle bg-surface-0 px-5 py-2 text-xs text-ink-500">{tab[2]}</div>

        {data.data.length === 0 ? (
          <Empty>{filter === 'fresh' ? 'No fresh clients right now. New ones appear here when more leads are imported or another executive is absent.' : 'Nothing here.'}</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {data.data.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
                <div className="min-w-0 flex-1">
                  <button className="block max-w-full truncate text-left font-semibold hover:text-signal-greenDark hover:underline" onClick={() => setOpen(l.id)}>{l.name}</button>
                  <div className="mono-num text-sm text-ink-500">{l.mobile}</div>
                  {l.shared_from_name && (
                    <div className="mt-0.5 text-xs font-semibold text-sky">⇄ Shared by {l.shared_from_name} · {fmtDate(l.shared_at)}{l.shared_note ? ` — “${l.shared_note}”` : ''}</div>
                  )}
                  {l.status === 'NO_ANSWER' && <div className="text-xs font-semibold text-ink-500">Not pickup — last tried {fmtDateTime(l.last_called_at)}</div>}
                  {l.status === 'NOT_INTERESTED' && <div className="text-xs font-semibold text-coral">Not interested — last called {fmtDateTime(l.last_called_at)}</div>}
                  {l.status === 'INTERESTED' && l.interested_at && <div className="text-xs font-semibold text-signal-greenDark">Interested since {fmtDate(l.interested_at)}</div>}
                  {l.status === 'CALLBACK' && <div className="text-xs font-semibold text-amber-dark">Call back: {fmtDateTime(l.followup_at)}</div>}
                  {l.remark && <div className="mt-0.5 line-clamp-1 text-xs text-ink-300">{l.remark}</div>}
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <Badge value={l.status} />
                  <CallCount count={l.call_count} min={data.minCalls} />
                  {l.account_status !== 'OPENED' && <button className="btn-ghost !px-3 !py-2" title="Share with another executive" onClick={() => setSharing(l)}>⇄ Share</button>}
                  <button className="btn-green ml-auto !px-3.5 !py-2" disabled={!!call || l.account_status === 'OPENED'} onClick={() => startCall(l, { onNext: callNext })}><PhoneIcon /> Call</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data.page} total={data.total} limit={data.limit} onPage={setPage} />
      </section>

      {open && <LeadDrawer leadId={open} onClose={() => setOpen(null)} onChanged={load} />}
      {sharing && <ShareModal lead={sharing} onClose={() => setSharing(null)} onDone={() => { setSharing(null); load(); }} />}
    </>
  );
}
