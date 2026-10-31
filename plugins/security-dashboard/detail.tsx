import { useState } from 'react';
import { investigationBrief, workSchema, type Alert, type Work } from './model';

type Props = { alert: Alert; busy: boolean; onBack: () => void; onSave: (work: Work | null) => Promise<boolean> };
export function AlertDetail({ alert, busy, onBack, onSave }: Props) {
  const [brief, setBrief] = useState(false);
  const [status, setStatus] = useState(alert.work?.status ?? '');
  const [url, setUrl] = useState(alert.work?.url ?? '');
  const [message, setMessage] = useState('');
  async function save() {
    const result = workSchema.nullable().safeParse(status ? { status, url: url.trim() || null } : null);
    if (!result.success) { setMessage('Use a GitHub PR URL without a query or fragment. PR open requires a linked PR.'); return; }
    if (await onSave(result.data)) setMessage('Local work status saved. GitHub alert state has not been changed.');
  }
  return <section aria-label="Alert investigation">
    <button onClick={onBack}>← Inbox</button>
    <p className="security-muted">{alert.repository} · Dependabot #{alert.number}</p>
    <h2>{alert.summary}</h2>
    <div className="security-detail-grid">
      <div className="security-panel"><h3>GitHub finding</h3><span className={`security-badge ${alert.severity}`}>{alert.severity} · open</span>
        <dl><dt>Package</dt><dd><code>{alert.package}</code> · {alert.ecosystem}</dd>
          <dt>Manifest</dt><dd><code>{alert.manifest}</code></dd><dt>Scope</dt><dd>{alert.scope}</dd>
          <dt>Vulnerable range</dt><dd><code>{alert.vulnerableRange}</code></dd><dt>First patched</dt><dd><code>{alert.patchedVersion ?? 'Not listed'}</code></dd>
          <dt>Reachability</dt><dd>Not assessed</dd></dl>
        <p className="security-muted">Runtime scope is not proof of exploitability. A patched version does not prove that a direct lockfile bump is supported.</p>
        <a href={alert.url} target="_blank" rel="noreferrer">Open alert on GitHub ↗</a>
      </div>
      <div className="security-panel"><h3>Investigation handoff</h3><p className="security-muted">Prepare a brief for a BB thread or another workflow. Choose any project/environment deliberately; this dashboard does not create one or launch an agent.</p>
        <button className="security-primary" onClick={() => setBrief(true)}>Prepare investigation brief</button>
        {brief && <><label className="security-field">Investigation brief<textarea rows={11} readOnly value={investigationBrief(alert)} onFocus={e => e.target.select()} /></label><p className="security-muted">Select and copy the brief. GitHub-only review needs no checkout but cannot run local tests. No work has been started.</p></>}
        <h3 className="security-section-label">Local work tracking</h3>
        <label className="security-field">Work status<select value={status} onChange={e => { setStatus(e.target.value); setMessage(''); }}><option value="">Needs triage</option><option value="investigating">Investigating</option><option value="pr-open">PR open · manually tracked</option></select></label>
        <label className="security-field">GitHub PR URL<input type="url" value={url} placeholder="https://github.com/owner/repo/pull/123" onChange={e => { setUrl(e.target.value); setMessage(''); }} /></label>
        <button disabled={busy} onClick={() => void save()}>Save work status</button>
        {message && <p role="status">{message}</p>}
        {alert.work?.url && <p><a href={alert.work.url} target="_blank" rel="noreferrer">Open linked PR ↗</a></p>}
        <p className="security-muted">Work status is manually recorded; PR merge/check status is not synced. An open PR is not a fixed alert. Only GitHub's open-alert listing determines whether this finding stays in the inbox.</p>
      </div>
    </div>
  </section>;
}
