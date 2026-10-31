import { describe, expect, it } from "vitest";
import { parseDocument } from "../parse-document";
import { resolveDocumentLink } from "../links";

describe("Markdown document model", () => {
  it("extracts semantic title, searchable text and a stable duplicate-safe outline", () => {
    const document = parseDocument("Plans/one.md", "---\nsecretMetadata: hidden\n---\n# A **useful** plan\n\n## Next steps\nRead code.\n\n## Next steps\n```ts\nconst example = 1;\n```\n");
    expect(document.title).toBe("A useful plan");
    expect(document.body).not.toContain("secretMetadata");
    expect(document.outline.map(h => h.id)).toEqual(["a-useful-plan", "next-steps", "next-steps-2"]);
    expect(document.body).toContain("const example");
  });
  it("falls back to a readable filename when there is no H1", () => {
    expect(parseDocument("Reports/verification-report.md", "Plain text").title).toBe("verification report");
  });
});

const paths = ["Plans/start.md", "Reports/report.md", "Designs/same.md", "Plans/same.md"];
describe("document links", () => {
  it("resolves relative links and wiki links only to unambiguous indexed files", () => {
    expect(resolveDocumentLink(paths, "Plans/start.md", "../Reports/report.md#outcome"))
      .toEqual({ path: "Reports/report.md", anchor: "outcome" });
    expect(resolveDocumentLink(paths, "Plans/start.md", "wiki:report"))
      .toEqual({ path: "Reports/report.md", anchor: "" });
    expect(() => resolveDocumentLink(paths, "Reports/report.md", "wiki:same")).toThrow(/ambiguous/i);
    expect(resolveDocumentLink(paths, "Plans/start.md", "#next-steps").path).toBe("Plans/start.md");
  });
  it("refuses filesystem schemes, escapes, malformed encodings and unknown files", () => {
    for (const link of ["file:///etc/passwd", "../../outside.md", "javascript:alert(1)",
      "%zz", "missing.md", "//server/a.md", "https://example.com/a.md"])
      expect(() => resolveDocumentLink(paths, "Plans/start.md", link)).toThrow();
  });
});
