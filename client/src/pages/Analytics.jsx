import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from 'recharts';
import api, { errMsg } from '../api';
import { useDialer } from '../context/Dialer';
import { useToast } from '../context/Toast';
import { PageHeader, Kpi, Spinner } from '../components/ui';
import { CHART_COLORS, fmtDuration, ymd } from '../utils';

const tip = { contentStyle: { borderRadius: 10, border: '1px solid #e2e5f0', fontSize: 13 } };
const axis = { tick: { fontSize: 12, fill: '#8892b0' }, tickLine: false, axisLine: false };

export default function Analytics() {
  const { tick } = useDialer();
  const toast = useToast();
  const [date, setDate] = useState(ymd());
  const [hourly, setHourly] = useState(null);
  const [daily, setDaily] = useState(null);
  const [range, setRange] = useState({ from: ymd(new Date(Date.now() - 6 * 86400000)), to: ymd() });
  const [execs, setExecs] = useState(null);
  const [view, setView] = useState('stacked');

  useEffect(() => { api.get('/stats/hourly', { params: { date } }).then((r) => setHourly(r.data)).catch((e) => toast(errMsg(e), 'err')); }, [date, tick, toast]);
  useEffect(() => { api.get('/stats/daily', { params: { days: 14 } }).then((r) => setDaily(r.data)).catch(() => {}); }, [tick]);
  useEffect(() => { api.get('/stats/executives', { params: range }).then((r) => setExecs(r.data.rows)).catch((e) => toast(errMsg(e), 'err')); }, [range, tick, toast]);

  const chartData = hourly ? hourly.labels.map((l, i) => {
    const row = { hour: l, Total: hourly.totals[i] };
    hourly.executives.forEach((e) => { row[e.name] = e.counts[i]; });
    return row;
  }) : [];
  const dayTotal = hourly ? hourly.totals.reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader title="Calling Analytics" subtitle="How many calls each executive made between 10 AM and 6 PM." />

      <section className="card mb-6 p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold">Calls per hour · 10 AM – 6 PM</h3>
            <p className="text-xs text-ink-300">{dayTotal} calls in working hours{hourly?.outside ? ` · ${hourly.outside} outside 10–6` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md bg-surface-2 p-1">
              {[['stacked', 'Stacked'], ['grouped', 'Side by side']].map(([k, t]) => (
                <button key={k} onClick={() => setView(k)} className={`rounded-sm px-3 py-1.5 text-xs font-semibold ${view === k ? 'bg-white shadow-sm' : 'text-ink-500'}`}>{t}</button>
              ))}
            </div>
            <input type="date" className="input !w-auto !py-2" value={date} max={ymd()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          </div>
        </div>
        {!hourly ? <Spinner /> : (
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke="#e2e5f0" vertical={false} />
                <XAxis dataKey="hour" {...axis} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tip} cursor={{ fill: '#eef0f8' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {hourly.executives.map((e, i) => (
                  <Bar key={e.id} dataKey={e.name} stackId={view === 'stacked' ? 'a' : undefined} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={view === 'stacked' ? 0 : [4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card mb-6 p-5">
        <h3 className="mb-4 text-base font-bold">Last 14 days</h3>
        <div className="h-[260px]">
          {!daily ? <Spinner /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily.map((d) => ({ ...d, day: d.date.slice(5) }))} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke="#e2e5f0" vertical={false} />
                <XAxis dataKey="day" {...axis} /><YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="calls" name="Calls" stroke="#10182b" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="connected" name="Connected" stroke="#12b886" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-bold">Executive performance</h3>
          <div className="flex items-center gap-2">
            <input type="date" className="input !w-auto !py-2" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label="From" />
            <span className="text-ink-300">to</span>
            <input type="date" className="input !w-auto !py-2" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label="To" />
          </div>
        </div>
        {!execs ? <Spinner /> : (
          <>
            <div className="h-[260px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={execs} margin={{ left: -18, right: 8 }}>
                  <CartesianGrid stroke="#e2e5f0" vertical={false} />
                  <XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} />
                  <Tooltip {...tip} cursor={{ fill: '#eef0f8' }} /><Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="calls" name="Calls" fill="#10182b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="connected" name="Connected" fill="#12b886" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="interested" name="Interested" fill="#e8a83c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr>{['Executive', 'Calls', 'Connected', 'Talk time', 'Avg call', 'Interested', 'Not int.', 'Call back', 'No answer', 'Clients owned', 'Accounts opened'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>
                  {execs.map((e) => (
                    <tr key={e.id}>
                      <td className="td whitespace-nowrap font-semibold">{e.name}{!e.active && <span className="ml-2 text-xs text-ink-300">(disabled)</span>}</td>
                      <td className="td mono-num font-bold">{e.calls}</td><td className="td mono-num">{e.connected}</td>
                      <td className="td mono-num whitespace-nowrap">{fmtDuration(e.talk_sec)}</td><td className="td mono-num whitespace-nowrap">{fmtDuration(e.avg_sec)}</td>
                      <td className="td mono-num">{e.interested}</td><td className="td mono-num">{e.not_interested}</td>
                      <td className="td mono-num">{e.callback}</td><td className="td mono-num">{e.no_answer}</td>
                      <td className="td mono-num">{e.leads}</td><td className="td mono-num font-bold text-signal-greenDark">{e.accounts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
