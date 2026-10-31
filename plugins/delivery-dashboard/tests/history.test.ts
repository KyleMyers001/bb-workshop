import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketMerges } from '../history.ts';
const end = Date.parse('2026-10-31T00:00:00Z');
test('daily buckets include zero days and exclude the next window', () => {
  const start = end - 7 * 86400000;
  const dates = [new Date(start).toISOString(), new Date(start + 86400000).toISOString(), new Date(end).toISOString()];
  const buckets = bucketMerges(dates, start, end, 7);
  assert.equal(buckets.length, 7);
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.merged, 0), 2);
  assert.deepEqual(buckets.map(bucket => bucket.merged), [1, 1, 0, 0, 0, 0, 0]);
});
test('six-month buckets use weeks with a partial final week', () => {
  const buckets = bucketMerges([], end - 180 * 86400000, end, 180);
  assert.equal(buckets.length, 26);
  assert.equal(buckets.at(-1)!.end, new Date(end).toISOString());
});
test('year uses UTC calendar months without dropping partial endpoints', () => {
  const start = end - 365 * 86400000;
  const buckets = bucketMerges([new Date(start).toISOString(), new Date(end - 1000).toISOString()], start, end, 365);
  assert.equal(buckets[0].start, new Date(start).toISOString());
  assert.equal(buckets.at(-1)!.end, new Date(end).toISOString());
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.merged, 0), 2);
});
