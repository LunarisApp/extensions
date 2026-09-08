import { describe, expect, it } from "vitest";
import type { ExportDocumentV1 } from "./contract";
import {
  paginatePreview,
  previewLayoutKey,
  wrapPreviewText,
  type TextMeasurer,
} from "./preview-layout";
import { DEFAULT_PDF_THEME } from "./theme";

const measure: TextMeasurer = (text, { size }) => Array.from(text).length * size * 0.5;

function document(blocks: ExportDocumentV1["blocks"] = []): ExportDocumentV1 {
  return { blocks, title: "Preview", version: 1 };
}

describe("preview text wrapping", () => {
  it("preserves marks and breaks overlong tokens at grapheme boundaries", () => {
    const lines = wrapPreviewText(
      [{ marks: { bold: true, link: "https://example.com" }, text: "abcdefgh" }],
      12,
      10,
      measure,
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.flat().every(({ marks }) => marks?.bold && marks.link)).toBe(true);
    expect(lines.flat().map(({ text }) => text).join("")).toBe("abcdefgh");
  });

  it("preserves Windows and legacy carriage-return line breaks", () => {
    const lines = wrapPreviewText([{ text: "one\r\ntwo\rthree" }], 100, 10, measure);

    expect(lines.map((line) => line.map(({ text }) => text).join(""))).toEqual([
      "one",
      "two",
      "three",
    ]);
  });
});

describe("preview pagination", () => {
  it("uses page size, orientation, and document margin overrides", () => {
    const pages = paginatePreview([{
      ...document(),
      layout: { margin: 24, orientation: "landscape", pageSize: "letter" },
    }], DEFAULT_PDF_THEME, measure);

    expect(pages[0]).toMatchObject({
      height: 612,
      marginBottom: 24,
      marginLeft: 24,
      marginRight: 24,
      marginTop: 24,
      width: 792,
    });
  });

  it("starts each document and explicit break on a new page", () => {
    const pages = paginatePreview([
      document([
        { children: [{ text: "Before" }], type: "paragraph" },
        { type: "page-break" },
        { children: [{ text: "After" }], type: "paragraph" },
      ]),
      { ...document(), title: "Second" },
    ], DEFAULT_PDF_THEME, measure);

    expect(pages).toHaveLength(3);
    expect(pages[0]?.fragments.some((fragment) => fragment.type === "text" && fragment.runs.some(({ text }) => text.includes("Before")))).toBe(true);
    expect(pages[1]?.fragments.some((fragment) => fragment.type === "text" && fragment.runs.some(({ text }) => text.includes("After")))).toBe(true);
    expect(pages[2]?.fragments[0]).toMatchObject({ kind: "title" });
  });

  it("paginates long text and supports every semantic block", () => {
    const theme = {
      ...DEFAULT_PDF_THEME,
      page: { ...DEFAULT_PDF_THEME.page, marginBottom: 390, marginTop: 390 },
    };
    const pages = paginatePreview([document([
      { children: [{ marks: { bold: true, italic: true }, text: "word ".repeat(200) }], type: "paragraph" },
      { blocks: [{ children: [{ text: "Quoted" }], type: "paragraph" }], type: "quote" },
      { language: "ts", text: "const value = 1;\n".repeat(10), type: "code" },
      { items: [{ blocks: [{ children: [{ text: "Item" }], type: "paragraph" }], checked: true }], ordered: false, type: "list" },
      { rows: [[{ blocks: [{ children: [{ text: "Cell" }], type: "paragraph" }] }]], type: "table" },
      { alt: "Drawing", source: "data:image/png;base64,image", type: "image" },
      { style: "dashed", type: "divider" },
    ])], theme, measure, new Map([["data:image/png;base64,image", { height: 400, width: 800 }]]));

    expect(pages.length).toBeGreaterThan(2);
    const fragments = pages.flatMap(({ fragments }) => fragments);
    expect(new Set(fragments.map(({ type }) => type))).toEqual(new Set(["text", "table-row", "image", "divider"]));
    expect(fragments.some((fragment) => fragment.type === "text" && fragment.quoteDepth > 0)).toBe(true);
    expect(fragments.some((fragment) => fragment.type === "text" && fragment.marker === "☑")).toBe(true);
  });

  it("renders an empty document message", () => {
    const pages = paginatePreview([document()], DEFAULT_PDF_THEME, measure);
    expect(pages[0]?.fragments.some((fragment) =>
      fragment.type === "text" && fragment.runs.some(({ text }) => text === "(No content available)"))).toBe(true);
  });

  it("renders image fallbacks and keeps list markers on image-only items", () => {
    const source = "data:image/png;base64,image";
    const pages = paginatePreview([document([
      { alt: "Unavailable diagram", source: "invalid", type: "image" },
      {
        items: [{ blocks: [{ alt: "Available diagram", source, type: "image" }] }],
        ordered: false,
        type: "list",
      },
    ])], DEFAULT_PDF_THEME, measure, new Map([[source, { height: 100, width: 200 }]]));
    const fragments = pages.flatMap(({ fragments }) => fragments);

    expect(fragments.some((fragment) =>
      fragment.type === "text" && fragment.runs.some(({ text }) => text === "Unavailable diagram"))).toBe(true);
    expect(fragments.some((fragment) => fragment.type === "image" && fragment.marker === "•")).toBe(true);
  });

  it("falls back instead of emitting invalid image dimensions", () => {
    const source = "data:image/png;base64,image";
    const pages = paginatePreview([document([
      { alt: "Broken dimensions", source, type: "image" },
    ])], DEFAULT_PDF_THEME, measure, new Map([[source, { height: 0, width: Number.NaN }]]));

    expect(pages[0]?.fragments.some((fragment) =>
      fragment.type === "text" && fragment.runs.some(({ text }) => text === "Broken dimensions"))).toBe(true);
  });

  it("does not repaginate for color or page-number-only changes", () => {
    const changed = {
      ...DEFAULT_PDF_THEME,
      colors: { ...DEFAULT_PDF_THEME.colors, text: "#ff0000" },
      pageNumbers: !DEFAULT_PDF_THEME.pageNumbers,
    };
    expect(previewLayoutKey(changed)).toBe(previewLayoutKey(DEFAULT_PDF_THEME));
  });
});
