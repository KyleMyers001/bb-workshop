import { useCallback, useEffect, useRef, useState } from 'react';
import { definePluginApp, useRealtime, useRpc } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
import type { Alert, Snapshot, Work } from './model';
import { AlertDetail } from './detail';
import { RepositoryList } from './repositories';
import './app.css';

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
const workLabel = (work: Work | null) => work?.status === 'pr-open' ? 'PR open · manually linked' : work ? 'Investigating' : 'Needs triage';

export function Dashboard() {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'inbox' | 'repositories'>('inbox');
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [patchOnly, setPatchOnly] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const mounted = useRef(false);
  const generation = useRef(0);
  const load = useCallback(() => {
    const version = ++generation.current;
    void rpc.call('view', null).then(result => {
      if (mounted.current && generation.current === version) { setData(result); setError(null); }
    }, () => {
      if (mounted.current && generation.current === version) setError('Security data unavailable. Check your connection and retry.');
    });
  }, [rpc]);
  useEffect(() => {
    mounted.current = true; load();
    const timer = setInterval(() => { setClock(Date.now()); load(); }, 30_000);
    return () => { mounted.current = false; ++generation.current; clearInterval(timer); };
  }, [load]);
  useRealtime('security-changed', load);
  async function mutate(operation: () => Promise<Snapshot>) {
    setBusy(true); ++generation.current;
    try {
      const result = await operation();
      if (mounted.current) { ++generation.current; setData(result); setError(null); setClock(Date.now()); }
      return true;
    } catch {
      if (mounted.current) setError('Save or refresh failed. Check input, connection, and concurrent watch-list edits; then retry.');
      return false;
    } finally { if (mounted.current) setBusy(false); }
  }
  const alerts = data?.repositories.flatMap(repo => repo.alerts) ?? [];
  const current = alerts.find(alert => alert.key === selected);
  const complete = !!data && data.repositories.every(repo => repo.status === 'readable');
  const readable = data?.repositories.filter(repo => repo.status === 'readable').length ?? 0;
  const stale = !!data?.updatedAt && clock - Date.parse(data.updatedAt) > 600_000;
  const filtered = alerts.filter(alert => (severity === 'all' || severity === alert.severity) &&
    (!patchOnly || alert.patchedVersion !== null) &&
    `${alert.repository} ${alert.package} ${alert.summary}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.createdAt.localeCompare(b.createdAt));
  return <section className="security-dashboard" aria-label="Team security inbox" tabIndex={0} aria-busy={busy || !data}>
    <header className="security-heading"><div><h1>Security</h1><p>Team repositories, without the checkout.</p></div>
      <button disabled={busy} onClick={() => void mutate(() => rpc.call('refresh', null))}>{busy ? 'Working…' : 'Refresh'}</button></header>
    <nav className="security-tabs" aria-label="Security views">
      <button aria-pressed={view === 'inbox' && !current} onClick={() => { setView('inbox'); setSelected(null); }}>Alert inbox</button>
      <button aria-pressed={view === 'repositories' && !current} onClick={() => { setView('repositories'); setSelected(null); }}>Repositories & scope</button>
    </nav>
    {error && <p role="alert" className="security-warning">{error}</p>}
    {!data && <p role="status">Loading security data…</p>}
    {data && <>
      {data.repositories.length > 0 && !complete && <p className="security-warning"><strong>Partial coverage.</strong> {readable} of {data.repositories.length} repositories fully readable. Counts exclude unavailable data and may be limited. <button className="security-link" onClick={() => { setView('repositories'); setSelected(null); }}>Inspect coverage</button></p>}
      {(stale || error && data.updatedAt) && <p className="security-warning">Stale data · last snapshot {data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'not collected'}.</p>}
      {selected && !current && <p role="status">This alert is no longer in the current readable snapshot. That does not by itself confirm a fix.</p>}
      {current ? <AlertDetail key={current.key} alert={current} busy={busy}
        onBack={() => setSelected(null)} onSave={work => mutate(() => rpc.call('saveWork', { key: current.key, work }))} />
        : view === 'repositories' ? <RepositoryList data={data} busy={busy}
          onSave={(watchList, expectedWatchList) => mutate(() => rpc.call('saveWatchList', { watchList, expectedWatchList }))} />
        : data.repositories.length === 0 ? <div className="security-empty"><h2>Choose the repositories your team owns</h2><p>No repositories are monitored yet. Add an explicit list in Repositories & scope. BB projects and GitHub team memberships do not define this list.</p></div>
        : <>
          <div className="security-summary"><span><b>{alerts.length}{complete ? '' : '+'}</b> known open alerts</span>
            <span><b>{alerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high').length}</b> critical / high</span>
            <span><b>{alerts.filter(alert => alert.patchedVersion).length}</b> patch available</span></div>
          <div className="security-filters"><input type="search" aria-label="Search alerts" placeholder="Search repository or package…" value={search} onChange={e => setSearch(e.target.value)} />
            <select aria-label="Severity" value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">All severities</option>{['critical', 'high', 'medium', 'low'].map(value => <option key={value} value={value}>{value}</option>)}</select>
            <label><input type="checkbox" checked={patchOnly} onChange={e => setPatchOnly(e.target.checked)} /> Patch available</label></div>
          <div className="security-table"><table><caption>{filtered.length} matching alerts · known findings only · severity, then oldest first</caption>
            <thead><tr><th scope="col">Severity</th><th scope="col">Alert / repository</th><th scope="col">Patch</th><th scope="col">Work</th><th scope="col">Age</th></tr></thead>
            <tbody>{filtered.map(alert => <tr key={alert.key}><td><span className={`security-badge ${alert.severity}`}>{alert.severity}</span></td>
              <td><button className="security-link" onClick={() => setSelected(alert.key)}>{alert.summary}</button><small>{alert.repository} · {alert.package} · {alert.scope}</small></td>
              <td>{alert.patchedVersion ? <code>{alert.patchedVersion}</code> : 'No patch listed'}</td><td>{workLabel(alert.work)}</td>
              <td>{Math.max(0, Math.floor((clock - Date.parse(alert.createdAt)) / 86_400_000))}d</td></tr>)}</tbody>
          </table></div>
          {filtered.length === 0 && <p className="security-empty">No alerts match this view. {complete ? 'This describes the current explicit watch list only.' : 'Coverage is incomplete; unreadable repositories are not known to be clear.'}</p>}
        </>}
      <footer className="security-footer">{data.updatedAt ? `Snapshot: ${new Date(data.updatedAt).toLocaleString()}` : 'No completed collection yet'} · Refreshes every 5 minutes while this page is open. GitHub is the alert source of truth.</footer>
    </>}
  </section>;
}

export default definePluginApp(app => {
  app.slots.navPanel({ id: 'security', title: 'Security', icon: 'Shield', path: 'security', component: Dashboard });
});
