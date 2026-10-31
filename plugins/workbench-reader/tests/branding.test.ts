import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);
describe("Workbench branding", () => {
  it("ships a standalone, theme-inheriting book-and-search SVG", () => {
    const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    expect(manifest.bb.branding.icon).toBe("./assets/workbench.svg");
    const file = new URL(manifest.bb.branding.icon, root);
    expect(fileURLToPath(file).startsWith(fileURLToPath(root))).toBe(true);
    const svg = readFileSync(file, "utf8");
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/<(?:script|image|foreignObject|style)\b|\bon\w+=|href=|#[\da-f]{3,8}\b/i);
  });
});
