import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { findSkillTokens } from "./highlight.ts";
import "./style.css";

export default definePluginApp((app) => {
  app.composer.customize({
    id: "skill-highlighting",
    // BB loads a plugin's stylesheet when one of its UI slots mounts.
    banners: [{ id: "highlight-styles", chrome: "bare", component: () => null }],
    richText: {
      effects: [{
        id: "slash-skill",
        className: "skill-highlighting-token",
        match: findSkillTokens,
      }],
    },
  });
});
