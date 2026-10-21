import { useEffect, useState, useCallback, useRef } from 'react';
import api, { errMsg } from '../api';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Badge, CallCount, PhoneIcon, Spinner, Empty } from '../components/ui';
import LeadDrawer from '../components/LeadDrawer';
import { fmtDateTime } from '../utils';

export default function CallDesk() {
  const { startCall, tick, call } = useDialer();
  const toast = useToast();
  const [queue, setQueue] = useState(null);
  const [open, setOpen] = useState(null);
  const queueRef = useRef([]);

  const load = useCallback(() => api.get('/leads/queue').then((r) => { setQueue(r.data); queueRef.current = r.data; }).catch((e) => toast(errMsg(e), 'err')), [toast]);
  useEffect(() => { load(); }, [load, tick]);

  // "Call next client" after saving a call → pick the next lead from a fresh queue
  const callNext = useCallback(async () => {
    try {
      const { data } = await api.get('/leads/queue');
      if (!data.length) { toast('Queue is empty — great work!'); return; }
      startCall(data[0], { onNext: callNext });
    } catch (e) { toast(errMsg(e), 'err'); }
  }, [startCall, toast]);

  if (!queue) return <Spinner />;
  const first = queue[0];

  return (
    <>
      <PageHeader title="Call Desk" subtitle="Clients that still need calls — fresh clients first, then call-backs, then clients with the fewest calls.">
        <button className="btn-green !py-3" disabled={!first || !!call} onClick={() => startCall(first, { onNext: callNext })}>
          <PhoneIcon /> Start calling {first ? `(${queue.length} in queue)` : ''}
        </button>
      </PageHeader>

      <section className="card overflow-hidden">
        {queue.length === 0 ? <Empty>No clients waiting. Import more leads or check All Clients.</Empty> : (
          <ul className="divide-y divide-border-subtle">
            {queue.map((c, i) => (
              <li key={c.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="mono-num hidden w-6 text-sm font-bold text-ink-300 sm:block">{i + 1}</span>
                  <div className="min-w-0">
                    <button className="block max-w-full truncate text-left font-semibold hover:text-signal-greenDark hover:underline" onClick={() => setOpen(c.id)}>{c.name}</button>
                    <div className="mono-num text-sm text-ink-500">{c.mobile}</div>
                    {c.status === 'CALLBACK' && <div className="text-xs font-semibold text-amber-dark">Call back: {fmtDateTime(c.followup_at)}</div>}
                    {c.remark && <div className="mt-0.5 line-clamp-1 text-xs text-ink-300">{c.remark}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-5">
                  <Badge value={c.status} />
                  <CallCount count={c.call_count} />
                  <button className="btn-green ml-auto !px-3.5 !py-2" disabled={!!call} onClick={() => startCall(c, { onNext: callNext })}><PhoneIcon /> Call</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open && <LeadDrawer leadId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}
