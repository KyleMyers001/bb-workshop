import { z } from 'zod';
import { metricSchema, repositorySchema } from './model-base.ts';

export function parseList(value: string): string[] {
  const items = new Map<string, string>();
  for (const item of value.split(/[\s,]+/).filter(Boolean)) {
    if (!items.has(item.toLowerCase())) items.set(item.toLowerCase(), item);
  }
  return [...items.values()];
}
export const usernamesSchema = z.string().refine(value => {
  const users = parseList(value);
  return users.length >= 1 && users.length <= 10 && users.every(user =>
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user));
}, 'Enter 1–10 GitHub usernames separated by commas or newlines');
export const repositoriesSchema = z.string().refine(value => {
  const repositories = parseList(value);
  return repositories.length <= 20 && repositories.every(repo => repositorySchema.safeParse(repo).success);
}, 'Enter up to 20 owner/repository names separated by commas or newlines');
export const personSchema = z.object({
  username: z.string(), opened: metricSchema, merged: metricSchema,
  previousMerged: metricSchema, open: metricSchema, medianMergeHours: metricSchema,
  reviewedPrs: metricSchema,
  history: z.array(z.object({ start: z.string(), end: z.string(), merged: z.number().int().nonnegative() })).nullable(),
  historyError: z.string().nullable(),
});
export type Person = z.infer<typeof personSchema>;
export type VelocityConfig = { usernames: string[]; repositories: string[]; days: number; token: string };
export function emptyPerson(username: string, error: string | null = null): Person {
  const metric = { value: null, error };
  return { username, opened: metric, merged: metric, previousMerged: metric,
    open: metric, medianMergeHours: metric, reviewedPrs: metric, history: null, historyError: error };
}
