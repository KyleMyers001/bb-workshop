import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

it("uses only public SDK and declared dependencies", () => {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));
  const packages = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  const allow = packages.map((name) => new RegExp(
    `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`,
  ));
  const scan = experimental_scanPublicSdkOnly(root, {
    allow: [...allow, /^@\/(?:components|lib|hooks)\//],
  });
  expect(scan.violations).toEqual([]);
  expect(scan.privateDependencies).toEqual([]);
});
