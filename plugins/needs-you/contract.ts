import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { changeSchema, idSchema, summarySchema, viewInputSchema, viewSchema } from "./model";

export const rpcContract = defineRpcContract({
  projects_list: {
    input: z.null(),
    output: z.object({ projects: z.array(z.object({ id: idSchema, name: z.string() })) }),
  },
  inbox_view: { input: viewInputSchema, output: viewSchema },
  inbox_summary: { input: z.null(), output: summarySchema },
  request_change: { input: changeSchema, output: z.object({ id: idSchema }) },
});
