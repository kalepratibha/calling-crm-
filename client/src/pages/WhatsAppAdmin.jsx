import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useToast } from '../context/Toast';
import { PageHeader, Spinner } from '../components/ui';
import { renderTemplate, withGroupLink } from '../utils';

// Admin: the WhatsApp message that is sent to the client after each kind of call result.
const KINDS = [
  ['INTERESTED', 'Interested', 'Welcome + WhatsApp group link + the executive\'s own Zoom link', 'border-signal-green'],
  ['NOT_INTERESTED', 'Not interested', 'Polite thank-you message', 'border-coral'],
  ['CALLBACK', 'Call back later', 'Confirms the call-back time the executive entered', 'border-amber'],
  ['NO_ANSWER', 'Not pickup / no answer', 'Sent when the client did not pick up the call', 'border-ink-500'],
];
const VARS = ['{name}', '{executive}', '{zoom_link}', '{group_link}', '{callback_time}'];

export default function WhatsAppAdmin() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [tpl, setTpl] = useState({});
  const [group, setGroup] = useState('');
  const [groupAll, setGroupAll] = useState(true);
  const [zooms, setZooms] = useState({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('INTERESTED');

  useEffect(() => {
    api.get('/whatsapp/admin').then((r) => { setD(r.data); setTpl(r.data.templates); setGroup(r.data.group_link); setGroupAll(r.data.group_all !== false); setZooms(Object.fromEntries(r.data.executives.map((x) => [x.id, x.zoom_link || '']))); }).catch((e) => toast(errMsg(e), 'err'));
  }, [toast]);

  async function save() {
    setBusy(true);
    try { await api.put('/whatsapp/admin', { templates: tpl, group_link: group, group_all: groupAll }); toast('WhatsApp messages saved'); }
    catch (e) { toast(errMsg(e), 'err'); }
    finally { setBusy(false); }
  }
  async function saveZoom(x) {
    try { await api.put(`/whatsapp/admin/zoom/${x.id}`, { zoom_link: zooms[x.id] || '' }); toast(`Zoom link saved for ${x.name}`); setD((o) => ({ ...o, executives: o.executives.map((e) => (e.id === x.id ? { ...e, zoom_link: (zooms[x.id] || '').trim() } : e)) })); }
    catch (e) { toast(errMsg(e), 'err'); }
  }
  if (!d) return <Spinner />;
  const sample = d.executives.find((x) => x.zoom_link) || d.executives[0];
  const shown = renderTemplate(withGroupLink(tpl[preview], group, groupAll), { name: 'Yogesh Pattanaik', executive: sample?.name || 'Executive', zoom_link: sample?.zoom_link || '', group_link: group, callback_time: '18 Oct, 11:00 am' });

  return (
    <>
      <PageHeader title="WhatsApp Messages" subtitle="After a call, the executive saves the result and WhatsApp opens with the matching message for the client — he only presses Send.">
        <button className="btn-dark" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save all messages'}</button>
      </PageHeader>

      <section className="card mb-5 p-5">
        <label className="label">WhatsApp group link (same for everybody)</label>
        <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="https://chat.whatsapp.com/…" />
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={groupAll} onChange={(e) => setGroupAll(e.target.checked)} />
          Send the WhatsApp group join link in EVERY message (Interested, Not interested, Call back, Not pickup)
        </label>
        <p className="mt-2 text-xs text-ink-500">Fill these words in a message and they are replaced automatically: {VARS.map((v) => <code key={v} className="mx-0.5 rounded bg-surface-2 px-1.5 py-0.5 text-[12px] font-bold">{v}</code>)}
          — <b>{'{zoom_link}'}</b> is each executive's own link (set in Executives → Edit). If an executive has no Zoom link yet, the lines with it are left out.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {KINDS.map(([k, name, hint, border]) => (
          <section key={k} className={`card border-l-4 p-5 ${border}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-base font-bold">{name}</h3>
              <button className="text-xs font-semibold text-ink-500 underline" onClick={() => setPreview(k)}>Preview</button>
            </div>
            <p className="mb-2 text-xs text-ink-500">{hint}</p>
            <textarea className="input min-h-[260px] resize-y text-[13px] leading-relaxed" value={tpl[k] || ''} onChange={(e) => setTpl((t) => ({ ...t, [k]: e.target.value }))} />
            <button className="mt-2 text-xs text-ink-300 underline" onClick={() => setTpl((t) => ({ ...t, [k]: d.defaults[k] }))}>Reset to the original text</button>
          </section>
        ))}
      </div>

      <section className="card mt-5 p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold">Preview — {KINDS.find((x) => x[0] === preview)[1]}</h3>
          <span className="text-xs text-ink-300">as sent by {sample?.name || 'an executive'}</span>
        </div>
        <pre className="whitespace-pre-wrap rounded-md bg-[#dcf8c6] p-4 font-sans text-[13px] leading-relaxed text-ink-950">{shown}</pre>
      </section>

      <section className="card mt-5 overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3 text-sm font-bold">Zoom links of the executives <span className="font-normal text-ink-300">— add or edit here, then press Save</span></div>
        <ul className="divide-y divide-border-subtle">
          {d.executives.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 text-sm">
              <b className="min-w-[140px]">{x.name}</b>
              <input className="input min-w-[220px] flex-1 !py-1.5 text-xs" placeholder="https://zoom.us/j/…" value={zooms[x.id] ?? ''} onChange={(e) => setZooms((z) => ({ ...z, [x.id]: e.target.value }))} />
              <button className="btn-dark !px-3 !py-1.5" disabled={(zooms[x.id] || '').trim() === (x.zoom_link || '')} onClick={() => saveZoom(x)}>Save</button>
              {!x.zoom_link && <span className="text-xs font-semibold text-amber-dark">not set</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
