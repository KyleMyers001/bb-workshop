import assert from "node:assert/strict";
import { test } from "node:test";
import { findSkillTokens } from "./highlight.ts";

const cases: [string, string, string[]][] = [
  ["bare skill", "/developer", ["/developer"]],
  ["sentence", "Use /developer to implement this.", ["/developer"]],
  ["explicit skill", "/skill:developer fix this", ["/skill:developer"]],
  ["hyphenated names", "/code-critique /skill:closed-loop", ["/code-critique", "/skill:closed-loop"]],
  ["multiple lines", "/developer\n/gate", ["/developer", "/gate"]],
  ["punctuation", "(/developer), [/gate]! /planning.", ["/developer", "/gate", "/planning"]],
  ["Unicode offsets", "🧠 try /developer maintenant", ["/developer"]],
  ["URLs", "https://example.com/developer https://developer", []],
  ["paths", "/usr/bin /developer/file ./developer ~/developer C:/developer", []],
  ["extensions", "/developer.ts /developer.test.ts", []],
  ["embedded tokens", "foo/developer @/developer //developer", []],
  ["incomplete syntax", "/ /skill: /developer- /Developer /developer_name", []],
  ["full names only", "/developerTools /developer--tools", []],
  ["numbers", "/v2 /skill:test-123", ["/v2", "/skill:test-123"]],
  ["unknown names are syntactic", "/not-an-installed-skill", ["/not-an-installed-skill"]],
  ["single-component paths are ambiguous", "/tmp", ["/tmp"]],
  ["empty draft", "", []],
];

for (const [name, text, expected] of cases) {
  test(name, () => {
    const ranges = findSkillTokens(text);
    assert.deepEqual(ranges.map(({ from, to }) => text.slice(from, to)), expected);
    for (const { from, to } of ranges) {
      assert.ok(from >= 0 && to > from && to <= text.length);
    }
    assert.deepEqual(findSkillTokens(text), ranges, "matching is repeatable");
  });
}
