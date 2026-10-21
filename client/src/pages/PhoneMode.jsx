import { useEffect, useRef, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/Auth';
import { PageHeader, PhoneIcon } from '../components/ui';
import { fmtClock } from '../utils';

// Open this page on your MOBILE (sign in with the SAME mobile number + password as on the PC) and keep it open.
// PC: press Call  →  this phone's dial pad opens with the number.
// Phone: after the call you come back to this page  →  the PC shows the "Call ended" pop-up with the duration.
// (A web page cannot read the phone's call state; "coming back from the dial pad" is how the end is detected.)
const MIN_AWAY_MS = 4000; // shorter than this = the dialer did not really open

function openDialer(number) {
  const a = document.createElement('a');
  a.href = `tel:${number}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function PhoneMode() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [dial, setDial] = useState(null);          // number waiting to be called
  const [inCall, setInCall] = useState(null);      // { number, name, since } while the phone is in its dialer
  const [done, setDone] = useState(null);          // last finished call { name, number, sec }
  const [history, setHistory] = useState([]);
  const [, setNow] = useState(Date.now());
  const after = useRef(null);
  const wake = useRef(null);
  const armed = useRef(null);      // dial the phone is about to open
  const away = useRef(null);       // { hiddenAt, dial } while the page is in the background (dial pad open)

  // ---- receive numbers from the PC -------------------------------------------------------------
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const { data } = await api.get('/phone/poll', { params: { after: after.current ?? 0 } });
        if (stop) return;
        setConnected(true);
        if (data.dial) {
          after.current = data.dial.id;
          armed.current = data.dial;
          setDone(null);
          setDial(data.dial);
          setHistory((h) => [data.dial, ...h].slice(0, 8));
          navigator.vibrate?.([250, 120, 250]);
          try { openDialer(data.dial.number); } catch { /* the big Call now button is the fallback */ }
        }
      } catch { if (!stop) setConnected(false); }
    };
    poll();
    const t = setInterval(poll, 1000);
    const onShow = () => { if (!document.hidden) poll(); };   // phone unlocked / tab shown -> check immediately
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    navigator.wakeLock?.request('screen').then((w) => { wake.current = w; }).catch(() => {});
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow); wake.current?.release?.(); };
  }, []);

  // ---- detect: dial pad opened (page hidden) and call finished (page visible again) -------------
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (armed.current) {
          away.current = { hiddenAt: Date.now(), dial: armed.current };
          api.post('/phone/dialing').catch(() => {});                 // PC timer restarts: real dialing began
          setInCall({ ...armed.current, since: Date.now() });
          setDial(null);
          armed.current = null;
        }
      } else if (away.current) {
        const { hiddenAt, dial: d } = away.current;
        away.current = null;
        if (Date.now() - hiddenAt >= MIN_AWAY_MS) finish(d, Math.round((Date.now() - hiddenAt) / 1000));
        else { setInCall(null); setDial(d); armed.current = d; }       // dialer did not open — show Call button again
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!inCall) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [inCall]);

  async function finish(d, sec) {
    setInCall(null);
    setDone({ name: d.name, number: d.number, sec });
    try { await api.post('/phone/ended'); } catch { /* PC End call button still works */ }
  }

  const tapCall = (d) => { armed.current = d; };  // the <a href="tel:"> does the dialing; page hiding is detected above

  return (
    <>
      <PageHeader title="Phone Mode" subtitle="Keep this page open on your mobile. Calls you start on the PC open on this phone's dial pad." />

      <section className="card mb-5 p-5">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${connected ? 'bg-signal-green shadow-glow' : 'bg-coral'}`} />
          <div>
            <div className="font-bold">{connected ? 'Phone connected' : 'Connecting…'}</div>
            <div className="text-xs text-ink-500">Signed in as {user.name}. Press <b>Call</b> on your PC and the dial pad opens here.</div>
          </div>
        </div>
      </section>

      {dial && (
        <section className="card border-2 border-signal-green p-6 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-signal-greenDark">Calling from your PC</div>
          <h2 className="mt-2 text-2xl font-bold">{dial.name || 'Client'}</h2>
          <div className="mono-num mt-1 text-xl font-semibold text-ink-500">{dial.number}</div>
          <a href={`tel:${dial.number}`} onClick={() => tapCall(dial)} className="btn-green mt-5 w-full !py-4 text-lg"><PhoneIcon size={20} /> Call now</a>
          <button className="mt-3 text-xs text-ink-300 underline" onClick={() => { armed.current = null; setDial(null); }}>Dismiss</button>
        </section>
      )}

      {inCall && !dial && (
        <section className="card border-2 border-signal-green p-6 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-signal-greenDark">On call</div>
          <h2 className="mt-2 text-2xl font-bold">{inCall.name || 'Client'}</h2>
          <div className="mono-num mt-1 text-xl font-semibold text-ink-500">{inCall.number}</div>
          <div className="mono-num my-4 text-4xl font-bold">{fmtClock((Date.now() - inCall.since) / 1000)}</div>
          <button className="btn-red w-full !py-3.5" onClick={() => { away.current = null; finish(inCall, Math.round((Date.now() - inCall.since) / 1000)); }}>Call finished</button>
        </section>
      )}

      {!dial && !inCall && done && (
        <section className="card px-5 py-8 text-center text-sm text-ink-500">
          ✓ Call with <b>{done.name || 'Client'}</b> finished. Fill the result on your PC.
        </section>
      )}

      {!dial && !inCall && !done && (
        <section className="card px-5 py-10 text-center text-sm text-ink-300">Waiting for a call from your PC…</section>
      )}

      {history.length > 0 && (
        <section className="card mt-5 overflow-hidden">
          <div className="border-b border-border-subtle px-5 py-3 text-sm font-bold">Recent</div>
          <ul className="divide-y divide-border-subtle">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{h.name || 'Client'}</div><div className="mono-num text-xs text-ink-500">{h.number}</div></div>
                <a href={`tel:${h.number}`} onClick={() => tapCall(h)} className="btn-ghost !px-3 !py-1.5">Call again</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
