export type MergeBucket = { start: string; end: string; merged: number };

/** Rolling windows use UTC boundaries; the final month/week may be partial. */
export function bucketMerges(dates: string[], start: number, end: number, days: number): MergeBucket[] {
  const buckets: MergeBucket[] = [];
  let cursor = start;
  while (cursor < end) {
    let next: number;
    if (days > 180) {
      const current = new Date(cursor);
      next = Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1);
    } else next = cursor + (days > 30 ? 7 : 1) * 86_400_000;
    next = Math.min(next, end);
    buckets.push({ start: new Date(cursor).toISOString(), end: new Date(next).toISOString(), merged: 0 });
    cursor = next;
  }
  for (const date of dates) {
    const time = Date.parse(date);
    const bucket = buckets.find(bucket => time >= Date.parse(bucket.start) && time < Date.parse(bucket.end));
    if (bucket) bucket.merged++;
  }
  return buckets;
}
