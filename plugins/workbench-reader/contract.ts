import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const path = z.string().min(1).max(4096);
const document = z.object({
  path, title: z.string(), folder: z.string(), added: z.number().nullable(),
  modified: z.number(), snippet: z.string(),
});
const status = z.object({
  root: z.string(), folders: z.array(z.object({ name: z.string(), count: z.number() })),
  indexedAt: z.number(), warnings: z.array(z.string()),
});
export const searchSchema = z.object({
  query: z.string().max(300).default(""), folder: z.string().max(4096).default(""),
  sort: z.enum(["smart", "added", "updated"]).default("smart"),
  offset: z.number().int().min(0).max(20_000).default(0),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
export const rpcContract = defineRpcContract({
  search: { input: searchSchema, output: status.extend({
    documents: z.array(document), total: z.number(), hasMore: z.boolean(), correctedQuery: z.string().nullable(),
  }) },
  refresh: { input: z.null(), output: status },
  read: { input: z.object({ path }).strict(), output: z.object({
    path, title: z.string(), added: z.number().nullable(), modified: z.number(), content: z.string(),
    outline: z.array(z.object({ id: z.string(), text: z.string(), depth: z.number() })),
  }) },
  resolve: { input: z.object({ from: path, href: z.string().max(4096) }).strict(),
    output: z.object({ path, anchor: z.string() }) },
});
export type SearchResult = z.infer<typeof rpcContract.search.output>;
export type ReadResult = z.infer<typeof rpcContract.read.output>;
