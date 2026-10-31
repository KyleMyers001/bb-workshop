import type { BbPluginApi } from "@get-bb/plugin-sdk";

// BB requires a server entry. All browsing uses the public frontend SDK;
// this plugin registers no mutations, background agents, or persisted state.
export default function archivedThreads(_bb: BbPluginApi) {}
