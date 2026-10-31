import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { COLUMN_IDS } from "./model";

const id = z.string().trim().min(1).max(200);
export const moveSchema = z.object({
  column: z.enum(COLUMN_IDS),
  note: z.string().trim().max(280).default(""),
}).strict();
export const listSchema = z.object({
  projectId: id,
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(200).default(100),
}).strict();
export const cardMoveSchema = moveSchema.extend({ projectId: id, threadId: id });
export type MoveInput = z.infer<typeof cardMoveSchema>;
export type ListInput = z.infer<typeof listSchema>;

const cardSchema = z.object({
  id, projectId: id, title: z.string(), column: z.enum(COLUMN_IDS),
  note: z.string(), runtimeStatus: z.string(), providerId: z.string(),
  updatedAt: z.number(), movedAt: z.number().nullable(), movedBy: z.string().nullable(),
});

export const rpcContract = defineRpcContract({
  projects_list: {
    input: z.null(),
    output: z.object({ projects: z.array(z.object({ id, name: z.string() })) }),
  },
  board_list: {
    input: listSchema,
    output: z.object({ cards: z.array(cardSchema), hasMore: z.boolean() }),
  },
  card_move: {
    input: cardMoveSchema,
    output: z.object({ threadId: id, column: z.enum(COLUMN_IDS) }),
  },
});
