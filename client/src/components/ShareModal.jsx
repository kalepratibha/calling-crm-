import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/Auth';
import { useToast } from '../context/Toast';
import { Modal } from './ui';

// Executive → executive: hand a client (with a short note) to a colleague.
export default function ShareModal({ lead, onClose, onDone }) {
  const { user } = useAuth();
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/users').then((r) => setPeople(r.data.filter((u) => u.active && u.role === 'executive' && u.id !== user.id))).catch(() => {});
  }, [user.id]);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/share`, { to_executive_id: Number(to), note });
      toast(`${lead.name} shared with ${data.to}`); onDone();
    } catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  }

  return (
    <Modal title="Share client with another executive" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-surface-0 px-4 py-3">
          <div className="font-bold">{lead.name}</div>
          <div className="mono-num text-sm text-ink-500">{lead.mobile}</div>
        </div>
        <div>
          <label className="label" htmlFor="sh-to">Share with</label>
          <select id="sh-to" className="input" value={to} onChange={(e) => setTo(e.target.value)} required>
            <option value="">Choose executive…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sh-note">Note for him / her <span className="normal-case">(optional)</span></label>
          <textarea id="sh-note" className="input min-h-[70px] resize-y" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client prefers Hindi, call after 5 pm" />
        </div>
        <p className="text-xs text-ink-300">The client moves to the other executive's Inbox ("Shared with me") together with your note. Call history stays visible.</p>
        {err && <div className="rounded-md bg-coral-tint px-3 py-2 text-sm text-coral">{err}</div>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-dark flex-[2]" disabled={busy || !to}>{busy ? 'Sharing…' : 'Share client'}</button>
        </div>
      </form>
    </Modal>
  );
}
