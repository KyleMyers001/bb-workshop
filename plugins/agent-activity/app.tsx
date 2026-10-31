import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ActivityFooter } from "./activity-footer";
import { closeCompactSidebar, footerTargets } from "./footer-targets";
import "./activity.css";

function FooterPortals() {
  const targets = useSyncExternalStore(footerTargets.subscribe, footerTargets.getSnapshot);
  return targets.map((target, index) => createPortal(<ActivityFooter onNavigate={closeCompactSidebar} />, target, String(index)));
}

export default definePluginApp(app => {
  app.contentScripts.register({ id: "footer-targets",
    mount: ({ pluginId, signal }) => footerTargets.mount(pluginId, signal) });
  app.slots.experimental_appOverlay({ id: "activity-footer", component: FooterPortals });
});
