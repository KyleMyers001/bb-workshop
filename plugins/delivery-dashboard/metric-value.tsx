import type { Metric } from './model';

export function MetricValue({ label, metric, suffix, detail }: {
  label: string; metric: Metric; suffix?: string; detail: string;
}) {
  const icons: Record<string, string> = {
    'PRs merged': 'M6 3v12a6 6 0 0 0 6 6M6 8a9 9 0 0 0 9 9h3M15 14l3 3-3 3',
    'PRs opened': 'M6 3v18M18 21V9a6 6 0 0 0-6-6M9 6 6 3 3 6M15 18l3 3 3-3',
    'Median time to merge': 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    'PRs reviewed': 'M9 11l2 2 4-4M21 11a9 9 0 0 1-9 9H3l2-4a9 9 0 1 1 16-5',
    'Open PRs': 'M6 3v18M18 21V9a6 6 0 0 0-6-6M15 18l3 3 3-3',
    'Merge throughput': 'M3 17l6-6 4 4 8-10M15 5h6v6',
  };
  return <div className="delivery-metric">
    <dt className="text-sm text-muted-foreground"><span className="velocity-metric-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icons[label] ?? 'M3 17l6-6 4 4 8-10'} /></svg>
    </span>{label}</dt>
    <dd className="delivery-value">
      {metric.value === null ? '—' : metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      {metric.value === null ? null : <span className="delivery-unit">{suffix}</span>}
    </dd>
    <dd className="velocity-metric-detail"><p className="text-xs text-muted-foreground">{detail}</p>
    {metric.error && <p role="alert" className="mt-2 text-xs text-destructive">{metric.error}</p>}</dd>
  </div>;
}
