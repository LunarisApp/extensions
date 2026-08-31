import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StyleSettings } from "./style-settings";
import { DEFAULT_PDF_THEME } from "./theme";

describe("PDF appearance settings", () => {
  it("uses unique accordion relationships across exporter views", () => {
    const markup = renderToStaticMarkup(
      <>
        <StyleSettings disabled={false} onChange={() => undefined} theme={DEFAULT_PDF_THEME} />
        <StyleSettings disabled={false} onChange={() => undefined} theme={DEFAULT_PDF_THEME} />
      </>,
    );
    const controlledIds = [...markup.matchAll(/aria-controls="([^"]+)"/g)]
      .map((match) => match[1]);

    expect(controlledIds).toHaveLength(8);
    expect(new Set(controlledIds).size).toBe(8);
    for (const id of controlledIds) expect(markup).toContain(`id="${id}"`);
  });
});
