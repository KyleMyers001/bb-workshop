import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.log.info("Thinking signal sidebar enhancement loaded");
}
