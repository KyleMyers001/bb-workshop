import { z } from 'zod';

export const repositorySchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/, 'Use owner/repository',
).refine(value => !['.', '..'].includes(value.split('/')[1]), 'Use a repository name');
export const metricSchema = z.object({
  value: z.number().finite().nonnegative().nullable(),
  error: z.string().nullable(),
});
