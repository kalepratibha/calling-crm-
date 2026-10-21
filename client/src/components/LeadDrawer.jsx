import { useEffect, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { Modal, Badge, Outcome, ConfirmModal, CallCount, PhoneIcon, Spinner } from './ui';
import { fmtDateTime, fmtDuration, label, WEBINAR, ACCOUNT, ACTION_META } from '../utils';

export default function LeadDrawer({ leadId, onClose, onChanged }) {
  const { user, isAdmin } = useAuth();
  const { startCall, tick } = useDialer();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [execs, setExecs] = useState([]);
  const [remark, setRemark] = useState('');
  const [askDelete, setAskDelete] = useState(false);

  const load = useCallback(() => api.get(`/leads/${leadId}`).then((r) => { setLead(r.data); setRemark(r.data.remark || ''); }).catch((e) => toast(errMsg(e), 'err')), [leadId, toast]);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => { if (isAdmin) api.get('/users').then((r) => setExecs(r.data.filter((u) => u.active))); }, [isAdmin]);

  async function patch(body) {
    try { await api.patch(`/leads/${leadId}`, body); toast('Saved'); await load(); onChanged?.(); }
    catch (e) { toast(errMsg(e), 'err'); }
  }

  if (!lead) return <Modal title="Client" onClose={onClose} wide><Spinner /></Modal>;
  const notMine = !isAdmin && lead.executive_id !== user.id;     // visible only because it is in the shared pool - calling takes it over
  const locked = notMine || (lead.account_status === 'OPENED' && lead.executive_id && lead.executive_id !== user.id && !isAdmin);

  return (
    <Modal title={lead.name} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <a href={`tel:${lead.mobile}`} className="mono-num text-lg font-bold text-ink-800">{lead.mobile}</a>
        <Badge value={lead.status} />
        <CallCount count={lead.call_count} />
        <div className="ml-auto flex gap-2">
          <a className="btn-ghost !py-2" href={`https://wa.me/91${lead.mobile}`} target="_blank" rel="noreferrer">WhatsApp</a>
          {!isAdmin && <button className="btn-green !py-2" disabled={locked && !notMine} onClick={() => startCall(lead)}><PhoneIcon /> Call</button>}
        </div>
      </div>
      {locked && <p className="mb-4 rounded-md bg-amber-tint px-3 py-2 text-xs text-amber-dark">{notMine ? `This is ${lead.executive_name || 'another executive'}'s client (shared pool). View only — press Call to take it over.` : `Account opened — this is ${lead.executive_name}'s client. View only.`}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="label">WhatsApp group</span>
          <button disabled={locked} onClick={() => patch({ group_joined: !lead.group_joined })}
            className={`w-full rounded-md border px-3 py-2.5 text-sm font-semibold disabled:opacity-50 ${lead.group_joined ? 'border-signal-green bg-signal-greenTint text-signal-greenDark' : 'border-border-subtle bg-surface-0 text-ink-500'}`}>
            {lead.group_joined ? '✓ Joined' : 'Not joined'}
          </button>
        </div>
        <div>
          <label className="label">Webinar</label>
          <select className="input" disabled={locked} value={lead.webinar_status} onChange={(e) => patch({ webinar_status: e.target.value })}>
            {WEBINAR.map((w) => <option key={w} value={w}>{label(w)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Account opening</label>
          <select className="input" disabled={locked} value={lead.account_status} onChange={(e) => patch({ account_status: e.target.value })}>
            {ACCOUNT.map((w) => <option key={w} value={w}>{label(w)}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Executive</label>
          {isAdmin ? (
            <select className="input" value={lead.executive_id || ''} onChange={(e) => patch({ executive_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Unassigned</option>
              {execs.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          ) : <div className="input">{lead.executive_name || 'Unassigned'}</div>}
        </div>
        {lead.status === 'CALLBACK' && lead.followup_at && (
          <div><span className="label">Call back on</span><div className="input">{fmtDateTime(lead.followup_at)}</div></div>
        )}
      </div>

      <div className="mt-4">
        <label className="label">Remark</label>
        <textarea className="input min-h-[72px]" disabled={locked} value={remark} onChange={(e) => setRemark(e.target.value)} />
        {!locked && remark !== (lead.remark || '') && <button className="btn-dark mt-2 !py-2" onClick={() => patch({ remark })}>Save remark</button>}
      </div>

      {Object.keys(lead.extra || {}).length > 0 && (
        <div className="mt-5">
          <span className="label">Lead form details</span>
          <dl className="grid gap-x-4 gap-y-1 rounded-md bg-surface-0 p-3 text-[13px] sm:grid-cols-2">
            {Object.entries(lead.extra).map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt className="shrink-0 text-ink-300">{k}:</dt><dd className="min-w-0 break-words font-medium text-ink-800">{String(v)}</dd></div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-5">
        <span className="label">Call history ({lead.calls.length})</span>
        {lead.calls.length === 0 ? <p className="text-sm text-ink-300">No calls yet.</p> : (
          <ol className="space-y-2">
            {lead.calls.map((c) => (
              <li key={c.id} className="rounded-md border border-border-subtle p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <b>{c.executive_name}</b><span className="text-ink-300">{fmtDateTime(c.started_at)}</span>
                  <span className="mono-num font-semibold">{fmtDuration(c.duration_sec)}</span><Outcome v={c.outcome} />
                </div>
                {c.remark && <p className="mt-1.5 text-[13px] text-ink-700">{c.remark}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-5">
        <span className="label">Activity timeline ({lead.activity?.length || 0})</span>
        {!lead.activity?.length ? <p className="text-sm text-ink-300">No activity recorded yet.</p> : (
          <ol className="relative space-y-3 border-l-2 border-border-subtle pl-4">
            {lead.activity.map((a) => {
              const m = ACTION_META[a.action] || { label: a.action, tone: 'bg-surface-2 text-ink-700' };
              return (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-ink-300" />
                  <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-300">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.tone}`}>{m.label}</span>
                    <b className="text-ink-700">{a.user_name || 'System'}</b><span>{fmtDateTime(a.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-800">{a.summary}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {isAdmin && (
        <div className="mt-6 border-t border-border-subtle pt-4 text-right">
          <button className="text-sm font-semibold text-coral hover:underline" onClick={() => setAskDelete(true)}>Delete client</button>
        </div>
      )}
      {askDelete && (
        <ConfirmModal danger title="Delete client?" confirmText="Delete client"
          message={`${lead.name} and all ${lead.calls.length} call(s) of history will be permanently deleted. This cannot be undone.`}
          onClose={() => setAskDelete(false)}
          onConfirm={async () => { try { await api.delete(`/leads/${lead.id}`); toast('Client deleted'); onChanged?.(); onClose(); } catch (e) { toast(errMsg(e), 'err'); setAskDelete(false); } }} />
      )}
    </Modal>
  );
}
