import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { mountSignal } from "./signal";
import "./signal.css";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "thinking-signal",
    mount: ({ signal }) => mountSignal(signal),
  });
});
