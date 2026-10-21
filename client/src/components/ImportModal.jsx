import { useEffect, useRef, useState, useCallback } from 'react';
import api, { errMsg } from '../api';
import { useToast } from '../context/Toast';
import { Modal, Kpi, Badge, Spinner, ConfirmModal } from './ui';
import { fmtDateTime } from '../utils';

function cleanPhone(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length >= 8 && d.length <= 15 ? d : `${v || '—'}  ⚠ invalid`;
}

// Import clients from a CSV / Excel file or a Google Sheet. Everything is saved in the database.
export default function ImportModal({ onClose, onImported }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [tab, setTab] = useState('import');           // import | history
  const [mode, setMode] = useState('file');           // file | sheet
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [map, setMap] = useState({ nameCol: '', phoneCol: '' });
  const [autoSync, setAutoSync] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null);
  const [sources, setSources] = useState([]);
  const [disconnect, setDisconnect] = useState(null);

  const loadHistory = useCallback(() => {
    api.get('/import/history').then((r) => setHistory(r.data)).catch(() => setHistory([]));
    api.get('/import/sources').then((r) => setSources(r.data)).catch(() => {});
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function doPreview(form) {
    setBusy(true); setError(''); setResult(null);
    try { const { data } = await api.post('/import/preview', form); setPreview(data); setMap(data.mapping); }
    catch (e) { setError(errMsg(e)); setPreview(null); }
    finally { setBusy(false); }
  }
  const fromFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f); doPreview(fd); e.target.value = '';
  };

  async function commit() {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/import/commit', { importId: preview.importId, ...map, autoSync });
      setResult(data); setPreview(null); setUrl(''); loadHistory(); onImported?.();
      toast(`${data.added} new clients saved to database`);
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  async function sync(s) {
    try { const { data } = await api.post(`/import/sources/${s.id}/sync`); toast(`Synced: ${data.added} new, ${data.duplicates} already present`); loadHistory(); onImported?.(); }
    catch (e) { toast(errMsg(e), 'err'); }
  }

  const valid = map.nameCol && map.phoneCol && map.nameCol !== map.phoneCol;
  const Tab = ({ k, children }) => (
    <button onClick={() => setTab(k)} className={`rounded-sm px-4 py-2 text-sm font-semibold transition ${tab === k ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-500'}`}>{children}</button>
  );

  return (
    <Modal title="Import clients" onClose={onClose} wide>
      <div className="mb-5 flex w-fit rounded-md bg-surface-2 p-1"><Tab k="import">Import</Tab><Tab k="history">Import history</Tab></div>

      {tab === 'import' && (
        <>
          {!preview && !result && (
            <>
              <div className="mb-4 flex w-fit rounded-md border border-border-subtle p-1">
                {[['file', 'CSV / Excel file'], ['sheet', 'Google Sheet link']].map(([k, t]) => (
                  <button key={k} onClick={() => { setMode(k); setError(''); }} className={`rounded-sm px-3 py-1.5 text-[13px] font-semibold ${mode === k ? 'bg-ink-950 text-white' : 'text-ink-500'}`}>{t}</button>
                ))}
              </div>
              {mode === 'file' ? (
                <div>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" className="hidden" onChange={fromFile} />
                  <button className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border-strong bg-surface-0 px-4 py-9 text-ink-500 hover:border-signal-green" onClick={() => fileRef.current?.click()} disabled={busy}>
                    <span className="text-2xl">⬆</span>
                    <span className="text-sm font-semibold">{busy ? 'Reading file…' : 'Click to choose a .csv or .xlsx file'}</span>
                    <span className="text-xs text-ink-300">Facebook Leads Center downloads work as they are</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); doPreview({ url }); }}>
                  <label className="label" htmlFor="url">Google Sheet link</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input id="url" className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} required />
                    <button className="btn-dark shrink-0" disabled={busy}>{busy ? 'Reading…' : 'Read sheet'}</button>
                  </div>
                  <p className="mt-2 text-xs text-ink-300">Share → General access → <b>Anyone with the link</b> (Viewer). Select the correct tab before copying the link.</p>
                </form>
              )}
            </>
          )}
          {error && <div className="mt-4 rounded-md bg-coral-tint px-3 py-2.5 text-sm font-medium text-coral">{error}</div>}

          {preview && (
            <div>
              <h3 className="mb-1 text-base font-bold">Check columns · {preview.total} rows found</h3>
              <p className="mb-4 text-sm text-ink-500">We guessed the columns. Change them if needed, then import.</p>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                {[['nameCol', 'Client name column'], ['phoneCol', 'Mobile number column']].map(([k, t]) => (
                  <div key={k}><label className="label">{t}</label>
                    <select className="input" value={map[k]} onChange={(e) => setMap({ ...map, [k]: e.target.value })}>
                      <option value="">— choose —</option>{preview.columns.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mb-3 overflow-x-auto rounded-md border border-border-subtle">
                <table className="w-full border-collapse">
                  <thead><tr><th className="th">Client name</th><th className="th">Mobile</th><th className="th">Status</th></tr></thead>
                  <tbody>{preview.sample.map((r, i) => (
                    <tr key={i}><td className="td">{map.nameCol ? r[map.nameCol] || '—' : '—'}</td><td className="td mono-num">{map.phoneCol ? cleanPhone(r[map.phoneCol]) : '—'}</td><td className="td"><Badge value="NEW" /></td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="mb-4 text-xs text-ink-300">Duplicate numbers are skipped. “+91”, “p:” and spaces are cleaned. Other columns (city, email, ad name…) are kept on the client's profile.</p>
              {preview.fromUrl && (
                <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
                  <input type="checkbox" className="h-4 w-4 accent-[#12b886]" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
                  Keep syncing this sheet automatically (every 15 minutes)
                </label>
              )}
              <div className="flex gap-2">
                <button className="btn-green" disabled={!valid || busy} onClick={commit}>{busy ? 'Saving…' : `Import ${preview.total} rows`}</button>
                <button className="btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
              </div>
            </div>
          )}

          {result && (
            <div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label="New clients saved" value={result.added} tone="green" />
                <Kpi label="Already existed" value={result.duplicates} />
                <Kpi label="Invalid numbers" value={result.invalid} tone={result.invalid ? 'red' : undefined} />
                <Kpi label="Rows read" value={result.total} />
              </div>
              <div className="flex gap-2">
                <button className="btn-dark" onClick={onClose}>Done</button>
                <button className="btn-ghost" onClick={() => setResult(null)}>Import another</button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div className="space-y-6">
          <div>
            <span className="label">Past imports</span>
            {!history ? <Spinner /> : history.length === 0 ? <p className="text-sm text-ink-300">Nothing imported yet.</p> : (
              <div className="overflow-x-auto rounded-md border border-border-subtle">
                <table className="w-full border-collapse">
                  <thead><tr>{['When', 'Source', 'By', 'New', 'Dup.', 'Invalid'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                  <tbody>{history.map((h) => (
                    <tr key={h.id}>
                      <td className="td whitespace-nowrap">{fmtDateTime(h.created_at)}</td>
                      <td className="td max-w-[200px] truncate" title={h.label}>{h.label}</td>
                      <td className="td whitespace-nowrap">{h.user_name || 'Auto-sync'}</td>
                      <td className="td mono-num font-bold text-signal-greenDark">{h.added}</td>
                      <td className="td mono-num">{h.duplicates}</td>
                      <td className="td mono-num">{h.invalid}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <span className="label">Connected Google Sheets</span>
            {sources.length === 0 ? <p className="text-sm text-ink-300">No sheet connected. Import from a Google Sheet link to keep it synced.</p> : (
              <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
                {sources.map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{s.label}</div>
                      <div className="text-xs text-ink-500">Last sync {fmtDateTime(s.last_synced_at)}</div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink-500">
                      <input type="checkbox" className="h-4 w-4 accent-[#12b886]" checked={!!s.auto_sync}
                        onChange={async (e) => { await api.patch(`/import/sources/${s.id}`, { auto_sync: e.target.checked }); loadHistory(); }} /> Auto-sync
                    </label>
                    <div className="flex gap-2">
                      <button className="btn-ghost !px-3 !py-1.5" onClick={() => sync(s)}>Sync now</button>
                      <button className="btn-ghost !px-3 !py-1.5 !text-coral" onClick={() => setDisconnect(s)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {disconnect && (
        <ConfirmModal title="Disconnect sheet?" confirmText="Disconnect" message="New rows from this Google Sheet will no longer be added automatically. Clients already imported stay."
          onClose={() => setDisconnect(null)} onConfirm={async () => { await api.delete(`/import/sources/${disconnect.id}`); setDisconnect(null); loadHistory(); }} />
      )}
    </Modal>
  );
}
