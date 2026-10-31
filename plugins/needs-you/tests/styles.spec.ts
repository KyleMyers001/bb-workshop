import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps a paired primary background and foreground on hover", () => {
  const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
  // A primary-specific pseudo-class must outrank the generic button:hover rule.
  const hover = css.match(/\.needs-page\s+\.needs-primary:hover\s*\{([^}]+)\}/)?.[1];
  expect(hover, "Primary hover needs its own contrasting color pair").toBeDefined();
  const declarations = new Map(hover!.split(";").filter(Boolean).map(declaration => {
    const colon = declaration.indexOf(":");
    return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
  }));
  expect(declarations.get("background")).toContain("var(--primary)");
  expect(declarations.get("color")).toBe("var(--primary-foreground)");
});
