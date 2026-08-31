import { describe, expect, it } from "vitest";
import { renderPdf } from "./pdf";

describe("generic PDF renderer", () => {
  it("renders semantic text, lists, tables, and page breaks", async () => {
    const data = await renderPdf([{
      blocks: [
        { children: [{ text: "Summary" }], level: 1, type: "heading" },
        { children: [{ text: "Portable content" }], type: "paragraph" },
        { items: [{ blocks: [{ children: [{ text: "First" }], type: "paragraph" }] }], ordered: true, type: "list" },
        { rows: [[{ blocks: [{ children: [{ text: "Cell" }], type: "paragraph" }] }]], type: "table" },
        { type: "page-break" },
      ],
      title: "Export",
      version: 1,
    }]);

    expect(new TextDecoder().decode(data.slice(0, 5))).toBe("%PDF-");
    expect(data.byteLength).toBeGreaterThan(500);
  }, 15_000);

  it("renders multilingual and emoji content", async () => {
    const data = await renderPdf([{
      blocks: [{ children: [{ text: "Ελληνικά 中文 👋" }], type: "paragraph" }],
      title: "Résumé",
      version: 1,
    }]);

    expect(new TextDecoder().decode(data.slice(0, 5))).toBe("%PDF-");
  }, 15_000);
});
