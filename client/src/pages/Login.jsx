import { useState } from 'react';
import api, { errMsg } from '../api';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/Auth';
import { getDeviceId } from '../utils';

export default function Login({ panel = 'executive' }) {
  const admin = panel === 'admin';
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState(null);      // { challenge_id, via, ttl_min } while waiting for the OTP
  const [code, setCode] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api.post('/auth/login', { phone, password, panel, device_id: getDeviceId() });
      if (res.status === 202 && res.data.otp_required) { setOtp(res.data); setCode(''); }
      else login(res.data.token, res.data.user);
    } catch (err) { setError(errMsg(err, 'Login failed')); }
    finally { setLoading(false); }
  }

  // First sign-in on this PC / browser: the OTP proves it is really you. Afterwards: number + password only.
  async function verify(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { challenge_id: otp.challenge_id, code, device_id: getDeviceId() });
      login(data.token, data.user);
    } catch (err) { setError(errMsg(err, 'OTP check failed')); }
    finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-center overflow-hidden bg-[linear-gradient(160deg,#0b1120_0%,#17213a_55%,#0f2a24_100%)] px-14 py-16 lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-signal-green/10 blur-3xl" />
        <div className="absolute left-14 top-12 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-green font-display text-lg font-extrabold text-ink-950">W</div>
          <span className="font-display text-lg font-bold text-white">WealthFund</span>
        </div>
        <div className={`mb-5 w-fit rounded-md px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest ${admin ? 'bg-amber/20 text-amber' : 'bg-signal-green/20 text-signal-green'}`}>{admin ? 'Admin Panel' : 'Executive Panel'}</div>
        {admin ? (
          <>
            <h1 className="max-w-[480px] text-[clamp(36px,4.2vw,52px)] font-bold leading-[1.08] text-white">Manage leads.<br />Track your team.<br />Stay in control.</h1>
            <p className="mt-6 max-w-[420px] text-base leading-relaxed text-ink-100/80">Import leads, assign clients, and see every call and every action your executives take.</p>
          </>
        ) : (
          <>
            <h1 className="max-w-[480px] text-[clamp(36px,4.2vw,52px)] font-bold leading-[1.08] text-white">Every lead.<br />Every call.<br />One desk.</h1>
            <p className="mt-6 max-w-[420px] text-base leading-relaxed text-ink-100/80">Call with one click, record what the client said and never miss a follow-up.</p>
          </>
        )}
      </div>
      <div className="flex items-center justify-center bg-surface-0 px-5 py-10">
        {otp ? (
          <form onSubmit={verify} className="card w-full max-w-sm p-7">
            <h2 className="text-2xl font-bold">Enter OTP</h2>
            <p className="mb-5 mt-1.5 text-sm text-ink-500">
              This is a new computer / browser, so we need to verify it once.{' '}
              {otp.via === 'sms' ? <>A 6-digit OTP was sent by SMS to <b>{phone}</b>.</> : <>Ask your <b>admin</b> for the 6-digit OTP (he can see it in the Admin panel → Executives).</>}
              {' '}It is valid for {otp.ttl_min} minutes. Next time you will only need your mobile number and password here.
            </p>
            <label className="label" htmlFor="otp">6-digit OTP</label>
            <input id="otp" className="input mono-num mb-4 text-center text-2xl font-bold tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            {error && <div className="mb-4 rounded-md bg-coral-tint px-3 py-2 text-sm font-medium text-coral">{error}</div>}
            <button className="btn-dark w-full !py-3" disabled={loading || code.length !== 6}>{loading ? 'Checking…' : 'Verify & sign in'}</button>
            <button type="button" className="mt-3 w-full text-center text-xs font-semibold text-ink-500 underline" onClick={() => { setOtp(null); setError(''); }}>← Back / send a new OTP</button>
          </form>
        ) : (
        <form onSubmit={submit} className="card w-full max-w-sm p-7">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal-green font-display text-lg font-extrabold text-ink-950">W</div>
            <span className="font-display text-lg font-bold">WealthFund</span>
          </div>
          <h2 className="text-2xl font-bold">{admin ? 'Admin sign in' : 'Executive sign in'}</h2>
          <p className="mb-6 mt-1.5 text-sm text-ink-500">Use your mobile number and password.</p>
          <label className="label" htmlFor="phone">Mobile number</label>
          <input id="phone" className="input mb-4" inputMode="numeric" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" required />
          <label className="label" htmlFor="pw">Password</label>
          <input id="pw" type="password" className="input mb-4" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <div className="mb-4 rounded-md bg-coral-tint px-3 py-2 text-sm font-medium text-coral">{error}</div>}
          <button className="btn-dark w-full !py-3" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          <p className="mt-5 text-center text-xs text-ink-300">
            {admin ? <>Executive? <Link to="/login" className="font-semibold text-ink-700 underline">Executive login</Link></>
              : <>Administrator? <Link to="/admin/login" className="font-semibold text-ink-700 underline">Admin login</Link></>}
          </p>
        </form>
        )}
      </div>
    </div>
  );
}
