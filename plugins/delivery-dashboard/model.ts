import { z } from 'zod';

import { metricSchema } from './model-base';
import { personSchema } from './velocity-model';
export { metricSchema, repositorySchema } from './model-base';
export const snapshotSchema = z.object({
  repository: z.string(), environment: z.string(), days: z.number(),
  refreshSeconds: z.number(), updatedAt: z.string().nullable(),
  people: z.array(personSchema), repositories: z.array(z.string()),
  deployments: metricSchema, openPrs: metricSchema, ciPassRate: metricSchema,
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type GitHubConfig = {
  repository: string; environment: string; days: number; token: string;
};
