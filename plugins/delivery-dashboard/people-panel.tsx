import { useState } from 'react';
import type { Person } from './velocity-model';
import { MetricValue } from './metric-value';
import { ActivityChart } from './activity-chart';

function display(value: number | null, suffix = '') {
  return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + suffix;
}
function delta(person: Person, days: number) {
  if (person.merged.value === null || person.previousMerged.value === null) return 'Previous period unavailable';
  const change = person.merged.value - person.previousMerged.value;
  return `${change > 0 ? '+' : ''}${change} vs previous ${days} days (${person.previousMerged.value})`;
}
export function PeoplePanel({ people, days }: { people: Person[]; days: number }) {
  const [selected, setSelected] = useState('');
  const person = people.find(person => person.username === selected) ?? people[0];
  if (!person) return <p className="delivery-empty text-sm">Add GitHub usernames in plugin settings.</p>;
  const values = [person.opened, person.merged, person.previousMerged,
    person.open, person.medianMergeHours, person.reviewedPrs];
  const commonError = values.every(value => value.error === person.merged.error) ? person.merged.error : null;
  const metric = (value: typeof person.merged) => commonError ? { ...value, error: null } : value;
  return <>
    <div className="delivery-person-toolbar">
      {people.length > 1 ? <label className="text-sm">Person{' '}
        <select className="delivery-select" value={person.username} onChange={event => setSelected(event.target.value)}>
          {people.map(person => <option key={person.username} value={person.username}>{person.username}</option>)}
        </select>
      </label> : <div className="velocity-identity"><span className="velocity-avatar" aria-hidden="true">{person.username[0]}</span><div><h2>{person.username}</h2><p>GitHub activity overview</p></div></div>}
      <span className="velocity-contributor-count">{people.length} {people.length === 1 ? 'contributor' : 'contributors'}</span>
    </div>
    {commonError && <p role="alert" className="delivery-empty text-sm text-destructive">{commonError}</p>}
    <ActivityChart person={person} days={days} />
    <dl className="delivery-grid">
      <MetricValue label="PRs merged" metric={metric(person.merged)} detail={delta(person, days)} />
      <MetricValue label="PRs opened" metric={metric(person.opened)} detail={`Authored in the last ${days} days`} />
      <MetricValue label="Median time to merge" metric={metric(person.medianMergeHours)} suffix="h" detail="Creation to merge, including draft time" />
      <MetricValue label="PRs reviewed" metric={metric(person.reviewedPrs)} detail={`GitHub review contributions in ${days} days`} />
      <MetricValue label="Open PRs" metric={metric(person.open)} detail="Your current open PRs, including drafts" />
      <MetricValue label="Merge throughput" metric={{ ...metric(person.merged),
        value: person.merged.value === null ? null : person.merged.value * 7 / days,
      }} suffix="/week" detail={`Normalized from the ${days}-day window`} />
    </dl>
    {people.length > 1 && <div className="delivery-comparison" tabIndex={0} role="region" aria-label="Contributor comparison">
      <table>
        <caption className="text-sm">Same repositories · Same {days}-day window</caption>
        <thead><tr><th scope="col">Person</th><th scope="col">Merged</th><th scope="col">Previous</th>
          <th scope="col">Opened</th><th scope="col">Merge time</th><th scope="col">Reviewed</th><th scope="col">Open</th></tr></thead>
        <tbody>{people.map(person => <tr key={person.username}>
          <th scope="row">{person.username}</th>
          {[person.merged, person.previousMerged, person.opened, person.medianMergeHours,
            person.reviewedPrs, person.open].map((metric, index) =>
            <td key={index} title={metric.error ?? undefined}>{display(metric.value, index === 3 ? 'h' : '')}
              {metric.error && <span className="sr-only"> {metric.error}</span>}</td>)}
        </tr>)}</tbody>
      </table>
    </div>}
    <p className="mb-3 text-xs text-muted-foreground">Activity and flow indicators; task size, collaboration,
      and work outside GitHub affect the comparison.</p>
  </>;
}
