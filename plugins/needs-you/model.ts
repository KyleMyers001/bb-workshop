import { z } from "zod";

export const CHANGED = "inbox-changed";
export const KINDS = ["question", "permission", "blocker", "review"] as const;
export const kindSchema = z.enum(KINDS);
export const idSchema = z.string().trim().min(1).max(200);
export const keySchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
export const bodySchema = z.object({
  kind: kindSchema,
  title: z.string().trim().min(1).max(160),
  ask: z.string().trim().min(1).max(2000),
  context: z.string().trim().max(2000).default(""),
  recommendation: z.string().trim().max(1000).default(""),
}).strict();
export const raiseSchema = bodySchema.extend({ key: keySchema });
export type Body = z.infer<typeof bodySchema>;
export type Raise = z.infer<typeof raiseSchema>;
export const requestSchema = bodySchema.extend({
  id: idSchema, threadId: idSchema, key: z.string(),
  source: z.enum(["agent", "cli", "kanban"]),
  status: z.enum(["open", "snoozed", "handled", "withdrawn"]),
  snoozedUntil: z.number().nullable(),
  version: z.number().int().positive(), raisedAt: z.number(), updatedAt: z.number(),
});
export type Request = z.infer<typeof requestSchema>;
export const itemSchema = requestSchema.extend({
  threadTitle: z.string(), projectId: idSchema, projectName: z.string(),
});
export type Item = z.infer<typeof itemSchema>;
export const viewInputSchema = z.object({
  projectId: idSchema.optional(),
  filter: z.enum(["open", "question", "permission", "blocker", "review", "snoozed", "history"]).default("open"),
  search: z.string().trim().max(200).default(""),
  offset: z.number().int().min(0).max(20_000).default(0),
  threadLimit: z.number().int().min(200).max(10_000).multipleOf(200).default(2000),
  refresh: z.boolean().default(false),
}).strict();
export type ViewInput = z.infer<typeof viewInputSchema>;
export const summarySchema = z.object({
  open: z.number().int().nonnegative(), snoozed: z.number().int().nonnegative(),
  history: z.number().int().nonnegative(),
  loadedThreads: z.number().int().nonnegative(), limited: z.boolean(),
  checkedAt: z.number(),
});
export type Summary = z.infer<typeof summarySchema>;
export const viewSchema = summarySchema.extend({
  items: z.array(itemSchema), hasMore: z.boolean(), matching: z.number(),
});
export type View = z.infer<typeof viewSchema>;
export const changeSchema = z.object({
  id: idSchema, version: z.number().int().positive(),
  action: z.enum(["snooze", "unsnooze", "handle", "reopen"]),
}).strict();
export type Change = z.infer<typeof changeSchema>;

export function effectiveStatus(request: Request, now: number): Request["status"] {
  return request.status === "snoozed" && (request.snoozedUntil ?? 0) <= now
    ? "open" : request.status;
}
export function sameCategory(a: Body, b: Body) {
  return (a.kind === "review") === (b.kind === "review");
}
export function sourceLabel(source: Request["source"]) {
  return { agent: "Agent-reported", cli: "CLI-reported", kanban: "Kanban fallback" }[source];
}
