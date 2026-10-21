import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Spinner, Empty } from '../components/ui';
import { fmtDateTime } from '../utils';

const ATT = {
  PRESENT: ['Present', 'bg-signal-greenTint text-signal-greenDark'],
  HALF_DAY: ['Half day', 'bg-amber-tint text-amber-dark'],
  ABSENT: ['Absent', 'bg-coral-tint text-coral'],
  LEAVE: ['On leave', 'bg-surface-2 text-ink-500'],
};

// Admin: how today's fresh clients are shared between the executives who are present
export default function InboxAdmin() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('/inbox/admin').then((r) => setD(r.data)).catch((e) => toast(errMsg(e), 'err')), [toast]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  async function run() {
    setBusy(true);
    try { const { data } = await api.post('/inbox/distribute'); toast(`${data.distributed || 0} client(s) moved between ${data.present || 0} present executive(s)`); load(); }
    catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(false); }
  }
  if (!d) return <Spinner />;
  const present = d.executives.filter((e) => ['PRESENT', 'HALF_DAY'].includes(e.attendance));
  const sharing = d.executives.filter((e) => e.in_distribution);
  const morning = d.phase === 'BEFORE_CUTOFF';
  const cut = `${String(d.cutoff_hour).padStart(2, '0')}:00`;
  const fresh = d.executives.reduce((s, e) => s + e.fresh_left, 0);

  return (
    <>
      <PageHeader title="Fresh Client Inbox" subtitle={morning
        ? `Before ${cut}: fresh clients are divided equally between ALL executives who are not marked absent. From ${cut} only the executives who signed in share them.`
        : `After ${cut}: fresh clients are divided equally between the executives who signed in today. Absent executives get none — their untouched clients moved to the present ones.`}>
        <button className="btn-dark" disabled={busy} onClick={run}>{busy ? 'Distributing…' : '⟳ Distribute now'}</button>
        <Link to="/admin/attendance" className="btn-ghost">Attendance</Link>
      </PageHeader>

      <section className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Waiting for an executive" value={d.unassigned} tone={d.unassigned && !present.length ? 'red' : undefined} hint={present.length ? 'Shared out automatically' : 'No executive present yet'} />
        <Kpi label="Present today" value={`${present.length} / ${d.executives.length}`} tone="green" />
        <Kpi label="Fresh clients held" value={fresh} />
        <Kpi label={morning ? `Sharing now (till ${cut})` : 'Sharing now (present only)'} value={sharing.length} hint={sharing.length ? `≈ ${Math.round((fresh + d.unassigned) / sharing.length)} fresh each` : 'nobody yet'} />
      </section>

      <section className="card overflow-hidden">
        {d.executives.length === 0 ? <Empty>No executives yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>{['Executive', 'Today', 'Gets clients', 'First sign-in', 'Handed today', 'Fresh left', 'Shared fresh', 'Calls (24h)'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {d.executives.map((e) => {
                  const a = ATT[e.attendance];
                  return (
                    <tr key={e.id}>
                      <td className="td whitespace-nowrap font-semibold">{e.name}</td>
                      <td className="td"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a ? a[1] : 'bg-surface-2 text-ink-300'}`}>{a ? a[0] : 'Not signed in'}</span></td>
                      <td className="td"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.in_distribution ? 'bg-signal-greenTint text-signal-greenDark' : 'bg-surface-2 text-ink-300'}`}>{e.in_distribution ? 'Yes' : 'No'}</span></td>
                      <td className="td whitespace-nowrap">{e.first_login_at ? fmtDateTime(e.first_login_at) : '—'}</td>
                      <td className="td mono-num">{e.allotted_today}</td>
                      <td className="td mono-num font-bold">{e.fresh_left}</td>
                      <td className="td mono-num">{e.shared_fresh}</td>
                      <td className="td mono-num">{e.calls_24h}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-4 text-xs text-ink-300">Rules: a client keeps belonging to the executive once he calls, or once the admin / a colleague assigns or shares it. Before the cutoff everyone not marked absent is counted (they are expected to sign in). At the cutoff, executives who have not signed in are dropped and their untouched clients are divided between the others. Imported clients are shared out automatically. A late executive gets his fair share the moment he signs in.</p>
    </>
  );
}
