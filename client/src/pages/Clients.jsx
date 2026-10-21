import { useEffect, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Badge, CallCount, Pagination, PhoneIcon, Spinner, Empty, Modal, ConfirmModal } from '../components/ui';
import LeadDrawer from '../components/LeadDrawer';
import ImportModal from '../components/ImportModal';
import ShareModal from '../components/ShareModal';
import { label, WEBINAR, ACCOUNT } from '../utils';

const STATUSES = ['NEW', 'INTERESTED', 'NOT_INTERESTED', 'CALLBACK', 'NO_ANSWER'];
const LIMIT = 20;
// Why a client of ANOTHER executive is visible in my "All Clients"
const poolTag = (c, days) => (c.pool_reason === 'CALLBACK' ? 'Call back' : c.pool_reason === 'NO_ANSWER' ? 'Not pickup' : c.pool_reason === 'NOT_INTERESTED' ? 'Not interested' : c.pool_reason ? `${days}-day return` : '');

export default function Clients() {
  const { user, isAdmin } = useAuth();
  const { startCall, tick } = useDialer();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [minCalls, setMinCalls] = useState(6);
  const [poolDays, setPoolDays] = useState(10);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [execs, setExecs] = useState([]);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [deleting, setDeleting] = useState(null); // a client, or 'bulk'
  const [picked, setPicked] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [f, setF] = useState({ search: '', status: '', executive: '', calls: '', webinar: '', account: '', group: '', scope: '' });
  const [q, setQ] = useState('');

  useEffect(() => { api.get('/users').then((r) => setExecs(r.data.filter((u) => u.active && u.role === 'executive'))); }, []);
  useEffect(() => { const t = setTimeout(() => { setF((x) => ({ ...x, search: q })); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/leads', { params: { ...f, page, limit: LIMIT } });
      setRows(data.data); setTotal(data.total); setMinCalls(data.minCalls); setPoolDays(data.poolDays || 10); setPicked([]);
    } catch (e) { toast(errMsg(e), 'err'); }
    finally { setLoading(false); }
  }, [f, page, toast]);
  useEffect(() => { load(); }, [load, tick]);

  const setFilter = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const notMine = (c) => !isAdmin && c.executive_id !== user.id;          // another executive's client shown from the shared pool
  const locked = (c) => (c.account_status === 'OPENED' && c.executive_id && c.executive_id !== user.id && !isAdmin) || notMine(c);

  async function patch(c, body) {
    try { await api.patch(`/leads/${c.id}`, body); load(); } catch (e) { toast(errMsg(e), 'err'); }
  }

  const CallBtn = ({ c }) => (isAdmin ? null :
    <button className="btn-green !px-3 !py-2" disabled={locked(c) && !notMine(c)} title={notMine(c) ? `${c.executive_name || 'Another executive'}'s client (${poolTag(c, poolDays)}) — calling takes it over` : locked(c) ? `Account opened — ${c.executive_name}'s client` : 'Call'} onClick={() => startCall(c)}>
      <PhoneIcon /> Call
    </button>
  );
  async function take(c) {
    try { await api.post(`/leads/${c.id}/take`); toast(`${c.name} is now yours — see it in your Inbox`); load(); } catch (e) { toast(errMsg(e), 'err'); }
  }
  const TakeBtn = ({ c }) => (notMine(c) ?
    <button className="btn-dark !px-3 !py-2" title={`Take ${c.name} from ${c.executive_name || 'the pool'} — it becomes yours (no call)`} onClick={() => take(c)}>✋ Take</button> : null);
  async function bulkAssign() {
    try {
      await api.post('/leads/bulk-assign', { ids: picked, executive_id: assignTo === 'none' ? null : Number(assignTo) });
      toast(`${picked.length} client(s) updated`); setAssignTo(''); load();
    } catch (e) { toast(errMsg(e), 'err'); }
  }
  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id));
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const Actions = ({ c }) => (
    <div className="flex items-center gap-1.5">
      {!notMine(c) && <button className="rounded-md border border-border-strong bg-white px-2.5 py-1.5 text-xs font-bold text-ink-800 hover:bg-surface-2 disabled:opacity-40" disabled={locked(c)} title="Edit client" onClick={() => setEditing(c)}>✎ Edit</button>}
      {c.executive_id === user.id && c.account_status !== 'OPENED' && <button className="rounded-md border border-border-strong bg-white px-2.5 py-1.5 text-xs font-bold text-ink-800 hover:bg-surface-2" title="Share with another executive" onClick={() => setSharing(c)}>⇄ Share</button>}
      {isAdmin && <button className="rounded-md border border-coral/40 bg-white px-2.5 py-1.5 text-xs font-bold text-coral hover:bg-coral-tint" title="Delete client" onClick={() => setDeleting(c)}>🗑 Delete</button>}
    </div>
  );
  const sel = 'rounded-md border border-border-subtle bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-signal-green disabled:opacity-50';

  return (
    <>
      <PageHeader title="All Clients" subtitle={isAdmin ? 'Every lead, with call progress, group, webinar and account status.' : `Your clients + everybody's Call back and Not pickup clients + Interested clients whose account was not opened in ${poolDays} days. Call one of those and it becomes yours.`}>
        <button className="btn-ghost" onClick={() => setAdding(true)}>＋ Add client</button>
        {isAdmin && <button className="btn-green" onClick={() => setImporting(true)}>⬆ Import</button>}
      </PageHeader>

      <section className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi label="Matching clients" value={total} />
        <Kpi label="This page" value={rows.length} />
        <Kpi label="Min. calls per client" value={minCalls} />
      </section>

      <section className="card overflow-hidden">
        <div className="grid grid-cols-2 gap-2 border-b border-border-subtle p-4 lg:grid-cols-4">
          <input className="input col-span-2" placeholder="Search name or mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={f.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All status</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          {!isAdmin && <select className="input" value={f.scope} onChange={(e) => setFilter('scope', e.target.value)}>
            <option value="">Whose: all visible</option><option value="mine">Only my clients</option><option value="pool">Shared pool (other executives)</option>
          </select>}
          {isAdmin && <select className="input" value={f.executive} onChange={(e) => setFilter('executive', e.target.value)}>
            <option value="">All executives</option><option value="mine">My clients</option><option value="unassigned">Unassigned</option>
            {execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>}
          <select className="input" value={f.calls} onChange={(e) => setFilter('calls', e.target.value)}>
            <option value="">Any call count</option><option value="zero">Never called</option><option value="lt">Less than {minCalls} calls</option><option value="gte">{minCalls}+ calls done</option>
          </select>
          <select className="input" value={f.group} onChange={(e) => setFilter('group', e.target.value)}>
            <option value="">Group: any</option><option value="1">Group joined</option><option value="0">Not joined</option>
          </select>
          <select className="input" value={f.webinar} onChange={(e) => setFilter('webinar', e.target.value)}>
            <option value="">Webinar: any</option>{WEBINAR.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <select className="input" value={f.account} onChange={(e) => setFilter('account', e.target.value)}>
            <option value="">Account: any</option>{ACCOUNT.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>

        {isAdmin && picked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-signal-greenTint px-4 py-2.5 text-sm">
            <b>{picked.length} selected</b>
            <select className="rounded-md border border-border-subtle bg-white px-2 py-1.5 text-xs font-semibold" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
              <option value="">Assign to…</option><option value="none">Unassign</option>
              {execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button className="btn-dark !px-3 !py-1.5" disabled={!assignTo} onClick={bulkAssign}>Apply</button>
            <button className="btn-ghost !px-3 !py-1.5" onClick={() => setPicked([])}>Clear</button>
            <button className="btn-red ml-auto !px-3 !py-1.5" onClick={() => setDeleting('bulk')}>🗑 Delete selected</button>
          </div>
        )}

        {loading ? <Spinner /> : rows.length === 0 ? <Empty>No clients match. {isAdmin && 'Use the Import button to add clients.'}</Empty> : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block [&_.td]:!px-3 [&_.th]:!px-3">
              <table className="w-full border-collapse">
                <thead>
                  <tr>{isAdmin && <th className="th w-8"><input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? [] : rows.map((r) => r.id))} /></th>}{['Client name', 'Mobile', 'Status', 'Executive', 'Remark', 'Calls', 'Group', 'Webinar', 'Account', 'Actions'].map((h) => <th key={h} className={`th ${h === 'Actions' ? 'sticky right-0 shadow-[-6px_0_8px_-6px_rgba(16,24,43,0.18)]' : ''}`}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-0/60">
                      {isAdmin && <td className="td"><input type="checkbox" aria-label={`Select ${c.name}`} checked={picked.includes(c.id)} onChange={() => togglePick(c.id)} /></td>}
                      <td className="td whitespace-nowrap"><button className="font-semibold text-ink-950 hover:text-signal-greenDark hover:underline" onClick={() => setOpen(c.id)}>{c.name}</button></td>
                      <td className="td mono-num whitespace-nowrap">{c.mobile}</td>
                      <td className="td whitespace-nowrap"><Badge value={c.status} /></td>
                      <td className="td whitespace-nowrap">{c.executive_name ? <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-500">{c.executive_name}</span> : <span className="text-[#a9b0c6]">Unassigned</span>}{notMine(c) && <span className="ml-1.5 rounded-full bg-amber-tint px-2 py-0.5 text-[11px] font-bold text-amber-dark">{poolTag(c, poolDays)}</span>}</td>
                      <td className="td max-w-[170px]"><div className="truncate" title={c.remark}>{c.remark || <span className="text-[#a9b0c6]">—</span>}</div></td>
                      <td className="td"><CallCount count={c.call_count} min={minCalls} /></td>
                      <td className="td">
                        <select className={sel} disabled={locked(c)} value={c.group_joined ? '1' : '0'} onChange={(e) => patch(c, { group_joined: e.target.value === '1' })}>
                          <option value="0">No</option><option value="1">Joined</option>
                        </select>
                      </td>
                      <td className="td">
                        <select className={sel} disabled={locked(c)} value={c.webinar_status} onChange={(e) => patch(c, { webinar_status: e.target.value })}>
                          {WEBINAR.map((w) => <option key={w} value={w}>{label(w)}</option>)}
                        </select>
                      </td>
                      <td className="td">
                        <select className={sel} disabled={locked(c)} value={c.account_status} onChange={(e) => patch(c, { account_status: e.target.value })}>
                          {ACCOUNT.map((w) => <option key={w} value={w}>{label(w)}</option>)}
                        </select>
                      </td>
                      <td className="td sticky right-0 whitespace-nowrap bg-white shadow-[-6px_0_8px_-6px_rgba(16,24,43,0.18)]"><div className="flex items-center gap-1.5"><CallBtn c={c} /><TakeBtn c={c} /><Actions c={c} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border-subtle md:hidden">
              {rows.map((c) => (
                <li key={c.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 text-left" onClick={() => setOpen(c.id)}>
                      <div className="truncate font-semibold">{c.name}</div>
                      <div className="mono-num text-sm text-ink-500">{c.mobile}</div>
                    </button>
                    <div className="flex items-center gap-1.5"><CallBtn c={c} /><TakeBtn c={c} /></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge value={c.status} />
                    <Badge value={c.account_status} />
                    <span className="text-xs text-ink-500">{c.executive_name || 'Unassigned'}</span>
                    {notMine(c) && <span className="rounded-full bg-amber-tint px-2 py-0.5 text-[11px] font-bold text-amber-dark">{poolTag(c, poolDays)}</span>}
                  </div>
                  <CallCount count={c.call_count} min={minCalls} />
                  {c.remark && <p className="line-clamp-2 text-[13px] text-ink-700">{c.remark}</p>}
                  <Actions c={c} />
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge value={c.group_joined ? 'YES' : 'NO'} /> <span className="text-ink-300">group</span>
                    <Badge value={c.webinar_status} /> <span className="text-ink-300">webinar</span>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </section>

      {open && <LeadDrawer leadId={open} onClose={() => setOpen(null)} onChanged={load} />}
      {sharing && <ShareModal lead={sharing} onClose={() => setSharing(null)} onDone={() => { setSharing(null); load(); }} />}
      {editing && <EditClient c={editing} isAdmin={isAdmin} execs={execs} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
      {deleting && (
        <ConfirmModal danger title={deleting === 'bulk' ? `Delete ${picked.length} clients?` : 'Delete client?'} confirmText="Delete"
          message={deleting === 'bulk' ? `${picked.length} selected clients and all their call history will be permanently deleted. This cannot be undone.`
            : `${deleting.name} (${deleting.mobile}) and all ${deleting.call_count} call(s) of history will be permanently deleted. This cannot be undone.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              if (deleting === 'bulk') await api.post('/leads/bulk-delete', { ids: picked });
              else await api.delete(`/leads/${deleting.id}`);
              toast(deleting === 'bulk' ? `${picked.length} clients deleted` : 'Client deleted');
              setDeleting(null); load();
            } catch (e) { toast(errMsg(e), 'err'); setDeleting(null); }
          }} />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onImported={load} />}
      {adding && <AddClient onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </>
  );
}

function AddClient({ onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr('');
    try { await api.post('/leads', { name, mobile }); toast('Client added'); onDone(); }
    catch (e2) { setErr(errMsg(e2)); }
  }
  return (
    <Modal title="Add client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Client name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="label">Mobile number</label><input className="input" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} required /></div>
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <button className="btn-dark w-full">Add client</button>
      </form>
    </Modal>
  );
}

function EditClient({ c, isAdmin, execs, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [mobile, setMobile] = useState(c.mobile);
  const [remark, setRemark] = useState(c.remark || '');
  const [exec, setExec] = useState(c.executive_id || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const body = {};
    if (name.trim() !== c.name) body.name = name;
    if (remark !== (c.remark || '')) body.remark = remark;
    if (isAdmin) {
      if (mobile !== c.mobile) body.mobile = mobile;
      if (String(exec) !== String(c.executive_id || '')) body.executive_id = exec ? Number(exec) : null;
    }
    if (!Object.keys(body).length) { onClose(); return; }
    try { await api.patch(`/leads/${c.id}`, body); toast('Client updated'); onDone(); }
    catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  }
  return (
    <Modal title="Edit client" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Client name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div>
          <label className="label">Mobile number</label>
          <input className="input" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={!isAdmin} required />
          {!isAdmin && <p className="mt-1 text-xs text-ink-300">Only admin can change the mobile number.</p>}
        </div>
        {isAdmin && (
          <div><label className="label">Executive</label>
            <select className="input" value={exec} onChange={(e) => setExec(e.target.value)}>
              <option value="">Unassigned</option>{execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
        <div><label className="label">Remark</label><textarea className="input min-h-[90px]" value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button className="btn-dark flex-[2]" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}
