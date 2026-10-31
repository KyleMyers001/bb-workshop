import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ships a distinct attention-bubble icon for plugin and sidebar branding", () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  expect(manifest.bb.branding.icon).toBe("./assets/attention.svg");
  expect(manifest.bb.branding.experimental_icons.attention).toBe(manifest.bb.branding.icon);
  const svg = readFileSync(new URL(manifest.bb.branding.icon, root), "utf8");
  expect(svg).toContain('viewBox="0 0 24 24"');
  expect(svg).not.toMatch(/<script|\son\w+=/i);
  const app = readFileSync(new URL("app.tsx", root), "utf8");
  expect(app).toContain('icon: "needs-you/attention"');
});
