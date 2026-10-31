import { useCallback, useEffect, useRef, useState } from 'react';
import { definePluginApp, useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
import type { Snapshot } from './model';
import { Button } from './components/ui/button';
import './app.css';
import { MetricValue } from './metric-value';
import { PeoplePanel } from './people-panel';


export function Dashboard() {
  const rpc = useRpc<typeof rpcContract>();
  const mounted = useRef(false);
  const request = useRef(0);
  const [range, setRange] = useState<7 | 30 | 180 | 365>(7);
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const load = useCallback(() => {
    const version = ++request.current;
    void rpc.call('view', { days: range }).then(result => {
      if (mounted.current && request.current === version) { setData(result); setError(null); }
    }, () => {
      if (mounted.current && request.current === version) setError('Dashboard unavailable. Try refreshing.');
    });
  }, [rpc, range]);
  useEffect(() => {
    mounted.current = true;
    load();
    // Also recover if a realtime notification was missed during reconnect.
    const timer = setInterval(() => { load(); setClock(Date.now()); }, 15_000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [load]);
  useRealtime('metrics-changed', load);
  const refresh = async () => {
    setBusy(true);
    ++request.current;
    try {
      await rpc.call('refreshView', { days: range });
      if (mounted.current) { load(); setClock(Date.now()); }
    } catch {
      if (mounted.current) setError('Refresh failed. Check your connection and retry.');
    } finally { if (mounted.current) setBusy(false); }
  };

  const age = data?.updatedAt ? Math.max(0, Math.floor((clock - Date.parse(data.updatedAt)) / 1000)) : null;
  const stale = age !== null && age > (data?.refreshSeconds ?? 300) * 2;
  return <section className="delivery-dashboard" aria-label="Personal GitHub velocity" aria-busy={busy || !data || data.days !== range}>
    <div className="delivery-toolbar">
      <div className="min-w-0">
        <p className="velocity-page-label">Your engineering rhythm</p>
        <p className="break-words text-xs text-muted-foreground">
          {data?.repositories.length ? data.repositories.join(', ') : 'All repositories visible to your signed-in account'}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
    <div className="velocity-range-toolbar">
      <div className="velocity-range-control" role="group" aria-label="Time span">
        {([{ label: 'Week', days: 7 }, { label: 'Month', days: 30 },
          { label: '6 months', days: 180 }, { label: 'Year', days: 365 }] as const).map(option =>
          <button type="button" key={option.days} aria-pressed={range === option.days}
            onClick={() => { ++request.current; setRange(option.days); setError(null); }}>{option.label}</button>)}
      </div>
      <span className="velocity-window-label">Rolling {range} days</span>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    {data && data.days === range ? <>
    <PeoplePanel people={data.people} days={data.days} />
    <details className="delivery-context text-xs text-muted-foreground">
      <summary className="cursor-pointer">Repository delivery context{data.repository ? ` · ${data.repository}` : ''}</summary>
      {data.repository ? <>
        <p className="mt-2">{data.environment} · Repository-wide metrics</p>
        <dl className="delivery-grid">
          <MetricValue label="Deploy frequency" metric={{ ...data.deployments,
            value: data.deployments.value === null ? null : data.deployments.value / data.days,
          }} suffix="/day" detail={`${data.deployments.value ?? '—'} successful deployments in ${data.days} days`} />
          <MetricValue label="Open PRs" metric={data.openPrs} detail="All authors, including drafts" />
          <MetricValue label="CI pass rate" metric={data.ciPassRate} suffix="%" detail="Successful / completed Actions runs" />
        </dl>
      </> : <p className="mt-2">Optionally select a repository in plugin settings for deploy and CI context.</p>}
    </details>
    <p role="status" className={`text-xs ${stale ? 'text-destructive' : 'text-muted-foreground'}`}>
      {age === null ? 'Waiting for first refresh' : `${stale ? 'Stale · ' : ''}Updated ${age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`} ago`}
      {` · Refreshes every ${data.refreshSeconds / 60} min`}
    </p>
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer">How metrics are counted</summary>
      <p className="mt-2">Opened and merged PRs are attributed to their author, not the person clicking Merge.
        Merge time is the median from creation to merge for PRs merged in the window, including draft time.
        PRs reviewed uses GitHub review contributions (one contribution per PR, not review comments).
        Previous period covers the preceding {data.days} days. Open PRs is a current count, including drafts.
        Counts reflect account visibility and search indexing; unavailable data displays —.
        Compare people within a shared repository scope and consider differences in role and task size.</p>
      <p className="mt-2">Repository context counts successful deployment records created in the window;
        later inactive statuses retain success. CI covers all completed Actions runs created in the window,
        including cancelled and skipped runs in the denominator. These are repository-level metrics.</p>
    </details>
    </> : <div className="velocity-loading" role="status">
      <div className="velocity-loading-chart" />
      <p>{error ?? `Loading ${range}-day activity…`}</p>
    </div>}

  </section>;
}
function VelocityPage() {
  return <div className="velocity-page h-full min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
    <div className="mx-auto w-full max-w-6xl"><Dashboard /></div>
  </div>;
}

export default definePluginApp(app => {
  app.slots.navPanel({
    id: 'personal-velocity', title: 'Personal velocity',
    icon: 'Gauge', path: 'velocity', component: VelocityPage,
  });
});
