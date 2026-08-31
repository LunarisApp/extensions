export interface PdfTheme {
  colors: {
    codeBackground: string;
    heading: string;
    link: string;
    tableBorder: string;
    text: string;
  };
  fontSize: {
    body: number;
    code: number;
    heading1: number;
    heading2: number;
    heading3: number;
    title: number;
  };
  lineHeight: {
    body: number;
    heading: number;
  };
  page: {
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
    marginTop: number;
    orientation: "landscape" | "portrait";
    pageSize: "a4" | "letter";
  };
  pageNumbers: boolean;
  spacing: {
    codeBlockPadding: number;
    headingGap: number;
    listIndent: number;
    paragraphGap: number;
  };
}

export const DEFAULT_PDF_THEME: PdfTheme = {
  colors: {
    codeBackground: "#f5f5f5",
    heading: "#000000",
    link: "#1a73e8",
    tableBorder: "#cccccc",
    text: "#17171c",
  },
  fontSize: {
    body: 11,
    code: 10,
    heading1: 22,
    heading2: 18,
    heading3: 15,
    title: 24,
  },
  lineHeight: { body: 1.5, heading: 1.3 },
  page: {
    marginBottom: 50,
    marginLeft: 55,
    marginRight: 55,
    marginTop: 60,
    orientation: "portrait",
    pageSize: "a4",
  },
  pageNumbers: false,
  spacing: {
    codeBlockPadding: 10,
    headingGap: 12,
    listIndent: 20,
    paragraphGap: 8,
  },
};

export const PDF_THEME_PRESETS = {
  default: DEFAULT_PDF_THEME,
  compact: {
    ...DEFAULT_PDF_THEME,
    fontSize: {
      body: 9,
      code: 8,
      heading1: 18,
      heading2: 15,
      heading3: 13,
      title: 20,
    },
    lineHeight: { body: 1.3, heading: 1.2 },
    page: {
      ...DEFAULT_PDF_THEME.page,
      marginBottom: 35,
      marginLeft: 40,
      marginRight: 40,
      marginTop: 35,
    },
    spacing: {
      codeBlockPadding: 6,
      headingGap: 8,
      listIndent: 15,
      paragraphGap: 5,
    },
  },
  academic: {
    ...DEFAULT_PDF_THEME,
    fontSize: {
      body: 12,
      code: 10,
      heading1: 24,
      heading2: 20,
      heading3: 16,
      title: 28,
    },
    lineHeight: { body: 1.8, heading: 1.4 },
    page: {
      ...DEFAULT_PDF_THEME.page,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72,
      marginTop: 72,
    },
    spacing: {
      codeBlockPadding: 12,
      headingGap: 16,
      listIndent: 24,
      paragraphGap: 10,
    },
  },
} satisfies Record<string, PdfTheme>;

export type PdfThemePreset = keyof typeof PDF_THEME_PRESETS;

type PartialPdfTheme = {
  [Section in keyof PdfTheme]?: PdfTheme[Section] extends object
    ? Partial<PdfTheme[Section]>
    : PdfTheme[Section];
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function finiteInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

export function mergePdfTheme(value: unknown): PdfTheme {
  const partial = value && typeof value === "object" ? value as PartialPdfTheme : {};
  const page = partial.page ?? {};
  const fontSize = partial.fontSize ?? {};
  const lineHeight = partial.lineHeight ?? {};
  const spacing = partial.spacing ?? {};
  const colors = partial.colors ?? {};
  return {
    colors: {
      codeBackground: color(colors.codeBackground, DEFAULT_PDF_THEME.colors.codeBackground),
      heading: color(colors.heading, DEFAULT_PDF_THEME.colors.heading),
      link: color(colors.link, DEFAULT_PDF_THEME.colors.link),
      tableBorder: color(colors.tableBorder, DEFAULT_PDF_THEME.colors.tableBorder),
      text: color(colors.text, DEFAULT_PDF_THEME.colors.text),
    },
    fontSize: {
      body: finiteInRange(fontSize.body, DEFAULT_PDF_THEME.fontSize.body, 6, 48),
      code: finiteInRange(fontSize.code, DEFAULT_PDF_THEME.fontSize.code, 6, 48),
      heading1: finiteInRange(fontSize.heading1, DEFAULT_PDF_THEME.fontSize.heading1, 6, 48),
      heading2: finiteInRange(fontSize.heading2, DEFAULT_PDF_THEME.fontSize.heading2, 6, 48),
      heading3: finiteInRange(fontSize.heading3, DEFAULT_PDF_THEME.fontSize.heading3, 6, 48),
      title: finiteInRange(fontSize.title, DEFAULT_PDF_THEME.fontSize.title, 6, 48),
    },
    lineHeight: {
      body: finiteInRange(lineHeight.body, DEFAULT_PDF_THEME.lineHeight.body, 1, 3),
      heading: finiteInRange(lineHeight.heading, DEFAULT_PDF_THEME.lineHeight.heading, 1, 3),
    },
    page: {
      marginBottom: finiteInRange(page.marginBottom, DEFAULT_PDF_THEME.page.marginBottom, 18, 100),
      marginLeft: finiteInRange(page.marginLeft, DEFAULT_PDF_THEME.page.marginLeft, 18, 100),
      marginRight: finiteInRange(page.marginRight, DEFAULT_PDF_THEME.page.marginRight, 18, 100),
      marginTop: finiteInRange(page.marginTop, DEFAULT_PDF_THEME.page.marginTop, 18, 100),
      orientation: page.orientation === "landscape" ? "landscape" : "portrait",
      pageSize: page.pageSize === "letter" ? "letter" : "a4",
    },
    pageNumbers: typeof partial.pageNumbers === "boolean"
      ? partial.pageNumbers
      : DEFAULT_PDF_THEME.pageNumbers,
    spacing: {
      codeBlockPadding: finiteInRange(spacing.codeBlockPadding, DEFAULT_PDF_THEME.spacing.codeBlockPadding, 0, 40),
      headingGap: finiteInRange(spacing.headingGap, DEFAULT_PDF_THEME.spacing.headingGap, 0, 40),
      listIndent: finiteInRange(spacing.listIndent, DEFAULT_PDF_THEME.spacing.listIndent, 0, 40),
      paragraphGap: finiteInRange(spacing.paragraphGap, DEFAULT_PDF_THEME.spacing.paragraphGap, 0, 40),
    },
  };
}

export function detectPdfThemePreset(theme: PdfTheme): PdfThemePreset | "custom" {
  const serialized = JSON.stringify(theme);
  for (const [id, preset] of Object.entries(PDF_THEME_PRESETS)) {
    if (JSON.stringify(preset) === serialized) return id as PdfThemePreset;
  }
  return "custom";
}
