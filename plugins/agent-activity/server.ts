import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function agentActivity(_bb: BbPluginApi) {
  // All data comes from BB's existing frontend thread cache; no polling or writes.
}
