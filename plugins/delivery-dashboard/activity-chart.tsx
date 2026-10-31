import { useEffect, useId, useRef, useState } from 'react';
import type { Person } from './velocity-model';

const dateLabel = (value: string, days: number) => new Date(value).toLocaleDateString(undefined,
  { month: 'short', ...(days > 180 ? { year: '2-digit' } : { day: 'numeric' }), timeZone: 'UTC' });

export function ActivityChart({ person, days }: { person: Person; days: number }) {
  const host = useRef<HTMLElement>(null);
  const [chartWidth, setChartWidth] = useState(920);
  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.max(260, Math.min(920, entry.contentRect.width))));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const id = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState<number | null>(null);
  const buckets = person.history;
  const bucket = buckets?.[hovered ?? -1];
  const width = chartWidth, height = 220, left = 38, right = 14, top = 18, bottom = 30;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const max = Math.max(1, ...(buckets?.map(bucket => bucket.merged) ?? []));
  const ceiling = Math.max(4, Math.ceil(max / 4) * 4);
  const x = (index: number) => left + index * plotWidth / Math.max(1, (buckets?.length ?? 1) - 1);
  const y = (value: number) => top + plotHeight * (1 - value / ceiling);
  const points = buckets?.map((bucket, index) => `${x(index)},${y(bucket.merged)}`).join(' ') ?? '';
  const granularity = days > 180 ? 'monthly' : days > 30 ? 'weekly' : 'daily';
  return <section ref={host} className="velocity-chart" aria-label="Merge activity chart">
    <div className="velocity-chart-heading">
      <div><h2>Merge activity</h2><p>Authored pull requests · {granularity} totals</p></div>
      <div className="velocity-chart-key"><span /> PRs merged</div>
    </div>
    {!buckets ? <div className="velocity-chart-empty" role="status">
      {person.historyError ?? 'Waiting for activity history…'}
    </div> : <>
      <div className="velocity-chart-readout" aria-live="polite">
        {bucket ? <><strong>{bucket.merged}</strong> merged · {dateLabel(bucket.start, days)}
          {days > 30 && ` – ${new Date(Date.parse(bucket.end) - 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}`}</>
          : <><strong>{person.merged.value ?? '—'}</strong> merged in this window <span>· Hover or focus a point to explore</span></>}
      </div>
      <svg className="velocity-plot" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Merged PRs, ${granularity} totals over ${days} days`}>
        <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--velocity-mint)" stopOpacity=".3" />
          <stop offset="100%" stopColor="var(--velocity-mint)" stopOpacity=".015" />
        </linearGradient></defs>
        {[0, 1, 2, 3, 4].map(step => <g key={step}>
          <line x1={left} x2={width - right} y1={y(step * ceiling / 4)} y2={y(step * ceiling / 4)} className="velocity-gridline" />
          <text x={left - 12} y={y(step * ceiling / 4) + 4} textAnchor="end" className="velocity-axis">{step * ceiling / 4}</text>
        </g>)}
        <polygon points={`${left},${y(0)} ${points} ${x(buckets.length - 1)},${y(0)}`} fill={`url(#${id}-fill)`} />
        <polyline points={points} className="velocity-line" />
        {buckets.map((bucket, index) => <g key={bucket.start}>
          {hovered === index && <line x1={x(index)} x2={x(index)} y1={top} y2={y(0)} className="velocity-cursor" />}
          <circle cx={x(index)} cy={y(bucket.merged)} r={hovered === index ? 5 : 3} className="velocity-point" />
          <rect x={Math.max(left, x(index) - plotWidth / buckets.length / 2)} y={top}
            width={plotWidth / buckets.length} height={plotHeight} fill="transparent" tabIndex={0} role="button"
            aria-label={`${dateLabel(bucket.start, days)}: ${bucket.merged} merged PRs`}
            onPointerEnter={() => setHovered(index)} onPointerLeave={() => setHovered(null)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setHovered(index); } }}
            onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onClick={() => setHovered(index)}>
            <title>{dateLabel(bucket.start, days)}: {bucket.merged} merged PRs</title>
          </rect>
          {(index === 0 || index === buckets.length - 1 || index === Math.floor((buckets.length - 1) / 2)) &&
            <text x={x(index)} y={height - 5} textAnchor={index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'} className="velocity-axis">{dateLabel(bucket.start, days)}</text>}
        </g>)}
      </svg>
      <div className="velocity-chart-footer"><span className="velocity-live-dot" />
        {buckets.every(bucket => bucket.merged === 0) ? 'No merged PRs in this window' : `${buckets.length} ${granularity === 'daily' ? 'daily' : granularity === 'weekly' ? 'weekly' : 'monthly'} buckets · UTC`}
        <details><summary>View data</summary><table><caption>PRs merged per bucket (UTC)</caption>
          <thead><tr><th scope="col">From</th><th scope="col">Until (exclusive)</th><th scope="col">Merged</th></tr></thead>
          <tbody>{buckets.map(bucket => <tr key={bucket.start}><th scope="row">{new Date(bucket.start).toLocaleString(undefined, { timeZone: 'UTC' })}</th>
            <td>{new Date(bucket.end).toLocaleString(undefined, { timeZone: 'UTC' })}</td><td>{bucket.merged}</td></tr>)}</tbody>
        </table></details>
      </div>
    </>}
  </section>;
}
