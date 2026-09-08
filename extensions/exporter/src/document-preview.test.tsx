// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentPreview } from "./document-preview";
import { DEFAULT_PDF_THEME } from "./theme";

describe("document preview", () => {
  it("renders accessible semantic pages and non-clickable marked text", () => {
    const markup = renderToStaticMarkup(
      <DocumentPreview
        documents={[{
          blocks: [{
            children: [{
              marks: {
                bold: true,
                code: true,
                color: "#123456",
                italic: true,
                link: "https://example.com",
                strike: true,
                underline: true,
              },
              text: "Marked text",
            }],
            type: "paragraph",
          }],
          title: "Preview",
          version: 1,
        }]}
        onError={() => {}}
        onReady={() => {}}
        theme={{ ...DEFAULT_PDF_THEME, pageNumbers: true }}
      />,
    );

    expect(markup).toContain("Document preview, 1 page");
    expect(markup).toContain("Page 1 of 1");
    expect(markup).toContain("Marked text");
    expect(markup).toContain("font-style:italic");
    expect(markup).toContain("font-weight:700");
    expect(markup).toContain("line-through");
    expect(markup).not.toContain("href=");
    expect(markup).toContain("1 / 1");
  });

  it("uses the PDF contrast fallback for unreadable text colors", () => {
    const markup = renderToStaticMarkup(
      <DocumentPreview
        documents={[{
          blocks: [{ children: [{ marks: { color: "#ffffff" }, text: "Visible" }], type: "paragraph" }],
          title: "Preview",
          version: 1,
        }]}
        onError={() => {}}
        onReady={() => {}}
        theme={{
          ...DEFAULT_PDF_THEME,
          colors: { ...DEFAULT_PDF_THEME.colors, text: "#ffffff" },
        }}
      />,
    );

    expect(markup).toContain("color:#17171c");
  });

  it("mounts only the first page when intersection observation is available", () => {
    const previous = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      disconnect() {}
      observe() {}
      takeRecords() { return []; }
      unobserve() {}
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [];
    } as unknown as typeof IntersectionObserver;
    try {
      const markup = renderToStaticMarkup(
        <DocumentPreview
          documents={[{
            blocks: [
              { children: [{ text: "First page" }], type: "paragraph" },
              { type: "page-break" },
              { children: [{ text: "Deferred page" }], type: "paragraph" },
            ],
            title: "Preview",
            version: 1,
          }]}
          onError={() => {}}
          onReady={() => {}}
          theme={DEFAULT_PDF_THEME}
        />,
      );

      expect(markup).toContain("Document preview, 2 pages");
      expect(markup).toContain("First page");
      expect(markup).not.toContain("Deferred page");
      expect(markup).toContain("height:841.89px;width:595.28px");
    } finally {
      globalThis.IntersectionObserver = previous;
    }
  });

  it("rescales whole pages when the preview width changes", async () => {
    const previous = globalThis.ResizeObserver;
    let resize!: ResizeObserverCallback;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      disconnect() {}
      observe() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          <DocumentPreview
            documents={[{ blocks: [], title: "Preview", version: 1 }]}
            onError={() => {}}
            onReady={() => {}}
            theme={DEFAULT_PDF_THEME}
          />,
        );
      });
      await act(async () => {
        resize([{ contentRect: { width: 330 } } as ResizeObserverEntry], {} as ResizeObserver);
      });

      expect(host.querySelector<HTMLElement>(".exporter-preview-page-container")?.style.width).toBe("298px");
      expect(host.querySelector<HTMLElement>(".exporter-preview-page")?.style.transform).toContain("scale(0.5006");
    } finally {
      await act(async () => root.unmount());
      host.remove();
      globalThis.ResizeObserver = previous;
    }
  });
});
