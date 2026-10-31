import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const original = new URL("../themes/midnight-observatory/", import.meta.url);
const studio = new URL("../themes/midnight-studio/", import.meta.url);
const marker = "/* Conversation reading — no composer or shell overrides below. */";

function stylesheet() {
  return readFileSync(new URL("theme.css", studio), "utf8");
}

test("Studio preserves Observatory's palette, input, and existing behavior", () => {
  const css = stylesheet();
  const base = readFileSync(new URL("theme.css", original), "utf8");
  // Ignore only the opening identity/rollback comment, not any CSS rule.
  assert.equal(css.slice(css.indexOf(":root"), css.indexOf(marker)).trim(),
    base.slice(base.indexOf(":root")).trim());
  assert.deepEqual(JSON.parse(readFileSync(new URL("theme.json", studio), "utf8")),
    JSON.parse(readFileSync(new URL("theme.json", original), "utf8")));
});

test("conversation edges are compact without removing spacing between paragraphs", () => {
  const css = stylesheet();
  assert.match(css,
    /\[data-message-column\] \[data-markdown-preview\] > :first-child\s*\{\s*margin-top:\s*0;\s*\}/);
  assert.match(css,
    /\[data-message-column\] \[data-markdown-preview\] > :last-child\s*\{\s*margin-bottom:\s*0;\s*\}/);
  assert.match(css,
    /\[data-message-column\] \[data-markdown-preview\] p\s*\{\s*margin:\s*\.85em 0;\s*\}/);
});

test("new rules are confined to conversation Markdown, never the input or fades", () => {
  const css = stylesheet().split(marker)[1];
  assert.ok(css, "Reading section must be explicitly delimited");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  assert.ok(rules.length >= 10, "Expect actual typography rules");
  for (const [, selector, declarations] of rules) {
    assert.ok(selector!.trim().startsWith("[data-message-column] [data-markdown-preview]"),
      `Out-of-scope selector: ${selector}`);
    assert.ok(!selector!.includes(","), "Keep each rule's scope explicit");
    assert.doesNotMatch(declarations!, /!important|\b(?:display|position|opacity|z-index)\s*:/);
  }
  assert.doesNotMatch(css, /promptbox|composer|mask-image|linear-gradient|@import|url\(/);
  assert.match(css, /font-size:\s*16px/);
  assert.match(css, /max-width:\s*74ch/);
  assert.match(css, /line-height:\s*1\.78/);
});
