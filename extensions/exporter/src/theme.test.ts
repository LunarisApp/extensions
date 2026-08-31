import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_THEME,
  detectPdfThemePreset,
  mergePdfTheme,
  PDF_THEME_PRESETS,
} from "./theme";

describe("PDF themes", () => {
  it("merges partial legacy values with defaults", () => {
    expect(mergePdfTheme({ page: { marginTop: 72 }, pageNumbers: true })).toMatchObject({
      colors: DEFAULT_PDF_THEME.colors,
      page: { marginTop: 72, pageSize: "a4" },
      pageNumbers: true,
    });
  });

  it("rejects invalid persisted settings", () => {
    expect(mergePdfTheme({
      colors: { text: "red" },
      fontSize: { body: 200 },
      page: { marginLeft: -10, orientation: "sideways", pageSize: "legal" },
    })).toMatchObject({
      colors: { text: DEFAULT_PDF_THEME.colors.text },
      fontSize: { body: 48 },
      page: { marginLeft: 18, orientation: "portrait", pageSize: "a4" },
    });
  });

  it("detects presets and custom themes", () => {
    expect(detectPdfThemePreset(PDF_THEME_PRESETS.academic)).toBe("academic");
    expect(detectPdfThemePreset({ ...DEFAULT_PDF_THEME, pageNumbers: true })).toBe("custom");
  });
});
