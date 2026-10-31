import { useEffect, useId, useState } from 'react';
import { parseRepositories, watchListSchema, type Snapshot } from './model';

type Props = { data: Snapshot; busy: boolean; onSave: (text: string, expected: string) => Promise<boolean> };
export function RepositoryList({ data, busy, onSave }: Props) {
  const editorId = useId();
  const [draft, setDraft] = useState(data.watchList);
  const [base, setBase] = useState(data.watchList);
  const [message, setMessage] = useState('');
  const dirty = draft !== base;
  useEffect(() => {
    if (!dirty) { setDraft(data.watchList); setBase(data.watchList); }
  }, [data.watchList, dirty]);
  const conflict = base !== data.watchList;
  async function save() {
    if (!watchListSchema.safeParse(draft).success) {
      setMessage('Enter up to 50 owner/repository names, separated by commas or new lines. URLs are not accepted.');
      return;
    }
    if (await onSave(draft, base)) {
      const accepted = parseRepositories(draft);
      const normalized = accepted.join('\n');
      setBase(normalized); setDraft(normalized);
      setMessage(`Watch list saved: ${accepted.length} ${accepted.length === 1 ? 'repository' : 'repositories'} accepted.`);
    }
  }
  return <section aria-label="Repository scope and coverage">
    <h2>Repositories & coverage</h2><p className="security-muted">GitHub team access is not ownership. This explicit list is the only monitoring scope.</p>
    <div className="security-panel security-watch">
      <label htmlFor={editorId}>Watched repositories</label>
      <textarea id={editorId} spellCheck={false} rows={5} value={draft} placeholder={'example-org/api\nexample-org/worker'} onChange={e => { setDraft(e.target.value); setMessage(''); }} />
      <p className="security-muted">One owner/repository per line, or comma-separated · up to 50 · GitHub.com only. No projects, checkouts, or agents are created.</p>
      {dirty && <p className="security-muted">Unsaved changes — coverage below still reflects your saved list.</p>}
      {conflict && <p className="security-warning">The watch list changed elsewhere. Your draft is preserved. Reload the latest list before saving.</p>}
      <div className="security-actions"><button disabled={busy || conflict} onClick={() => void save()}>Save watch list</button>
        {(dirty || conflict) && <button disabled={busy} onClick={() => { setDraft(data.watchList); setBase(data.watchList); setMessage(''); }}>Reload saved list</button>}</div>
      {message && <p role="status">{message}</p>}
    </div>
    <p className="security-muted">Authenticated with gh on the BB server. A 403/404 may mean insufficient permissions, disabled Dependabot, or a rate limit—not zero alerts.</p>
    <h3 className="security-section-label">Watching {data.repositories.length} {data.repositories.length === 1 ? 'repository' : 'repositories'}</h3>
    <p className="security-muted">Every saved entry is listed below, including repositories with no alerts or unavailable coverage.</p>
    {data.repositories.length > 0 && <div className="security-table"><table><caption>All {data.repositories.length} saved {data.repositories.length === 1 ? 'repository' : 'repositories'} · Dependabot coverage</caption><thead><tr><th scope="col">Repository</th><th scope="col">Dependabot coverage</th><th scope="col">Known open alerts</th><th scope="col">Checked</th></tr></thead>
      <tbody>{data.repositories.map(repo => <tr key={repo.repository}><td><a href={`https://github.com/${repo.repository}/security/dependabot`} target="_blank" rel="noreferrer">{repo.repository}</a></td>
        <td><span className={`security-badge ${repo.status}`}>{repo.status}</span>{repo.error && <small>{repo.error}</small>}</td>
        <td>{repo.status === 'unavailable' || repo.status === 'pending' ? 'Unknown' : `${repo.alerts.length}${repo.status === 'limited' ? '+' : ''}`}</td>
        <td>{repo.checkedAt ? new Date(repo.checkedAt).toLocaleString() : 'Not yet collected'}</td></tr>)}</tbody></table></div>}
  </section>;
}
