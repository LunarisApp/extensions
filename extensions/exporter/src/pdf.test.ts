import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderPdf } from "./pdf";
import { DEFAULT_PDF_THEME } from "./theme";

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

  it("applies page settings and page breaks", async () => {
    const data = await renderPdf([{
      blocks: [
        { children: [{ marks: { bold: true, link: "https://lunaris.app", underline: true }, text: "Styled" }], type: "paragraph" },
        { language: "ts", text: "const value = 1;", type: "code" },
        { type: "page-break" },
      ],
      title: "Custom",
      version: 1,
    }], {
      ...DEFAULT_PDF_THEME,
      page: { ...DEFAULT_PDF_THEME.page, orientation: "landscape", pageSize: "letter" },
      pageNumbers: true,
    });
    const document = await PDFDocument.load(data);

    expect(document.getPageCount()).toBe(2);
    expect(document.getPage(0).getSize()).toEqual({ height: 612, width: 792 });
  }, 15_000);
});
