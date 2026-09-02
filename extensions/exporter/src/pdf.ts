import unifontDataUrl from "@fontsource/unifont/files/unifont-latin-400-normal.woff?inline";
import fontkit from "@pdf-lib/fontkit";
import {
  degrees,
  PDFDocument,
  rgb,
  type Color,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ExportBlock, ExportDocumentV1, ExportText, ExportTextMark } from "./contract";
import { DEFAULT_PDF_THEME, mergePdfTheme, type PdfTheme } from "./theme";

const PAGE_SIZES: Record<"a4" | "letter", [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const MAIN_THREAD_BUDGET_MS = 12;

function mainThreadScheduler() {
  let deadline = performance.now() + MAIN_THREAD_BUDGET_MS;
  return async () => {
    if (performance.now() < deadline) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    deadline = performance.now() + MAIN_THREAD_BUDGET_MS;
  };
}

interface TextRun {
  marks?: ExportTextMark;
  text: string;
}

function plainText(values: ExportText[]): string {
  return values.map(({ text }) => text).join("");
}

function decodeDataUrl(source: string): Uint8Array {
  const encoded = source.split(",", 2)[1];
  if (!encoded) throw new Error("Bundled PDF font is unavailable");
  return Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
}

function dataUriBytes(source: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(source);
  if (!match?.[1] || !match[2]) return null;
  return {
    bytes: Uint8Array.from(atob(match[2]), (value) => value.charCodeAt(0)),
    mimeType: match[1].toLowerCase(),
  };
}

function toColor(value: string, fallback: string): Color {
  const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  return rgb(
    Number.parseInt(normalized.slice(1, 3), 16) / 255,
    Number.parseInt(normalized.slice(3, 5), 16) / 255,
    Number.parseInt(normalized.slice(5, 7), 16) / 255,
  );
}

function relativeLuminance(value: string): number | null {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function readableTextColor(value: string | undefined, fallback: string): string {
  for (const candidate of [value, fallback, DEFAULT_PDF_THEME.colors.text]) {
    if (!candidate) continue;
    const luminance = relativeLuminance(candidate);
    if (luminance !== null && 1.05 / (luminance + 0.05) >= 4.5) return candidate;
  }
  return DEFAULT_PDF_THEME.colors.text;
}

function wrapRuns(values: ExportText[], font: PDFFont, size: number, maximumWidth: number): TextRun[][] {
  const lines: TextRun[][] = [[]];
  let lineWidth = 0;
  const nextLine = () => {
    lines.push([]);
    lineWidth = 0;
  };
  for (const value of values) {
    for (const token of value.text.replaceAll("\t", "  ").split(/(\n|\s+)/)) {
      if (!token) continue;
      if (token === "\n") {
        nextLine();
        continue;
      }
      const whitespace = /^\s+$/.test(token);
      if (whitespace && lineWidth === 0) continue;
      const normalized = whitespace ? " " : token;
      const tokenWidth = font.widthOfTextAtSize(normalized, size);
      if (!whitespace && lineWidth > 0 && lineWidth + tokenWidth > maximumWidth) nextLine();
      const line = lines.at(-1) ?? [];
      const previous = line.at(-1);
      if (previous && previous.marks === value.marks) previous.text += normalized;
      else line.push({ marks: value.marks, text: normalized });
      lineWidth += tokenWidth;
    }
  }
  return lines.length ? lines : [[]];
}

function blockText(blocks: ExportBlock[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
        return plainText(block.children);
      case "code":
        return block.text;
      case "quote":
        return blockText(block.blocks);
      case "list":
        return block.items.map((item) => blockText(item.blocks)).join(" ");
      default:
        return "";
    }
  }).filter(Boolean).join(" ");
}

export async function renderPdf(
  documents: ExportDocumentV1[],
  configuredTheme: PdfTheme = DEFAULT_PDF_THEME,
): Promise<ArrayBuffer> {
  const yieldIfNeeded = mainThreadScheduler();
  const theme = mergePdfTheme(configuredTheme);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // fontkit can parse Unifont's WOFF2 source, but the resulting embedded font
  // has invisible outlines in Quartz and Poppler. The WOFF build subsets into
  // a valid PDF font across both renderers.
  const regular = await pdf.embedFont(decodeDataUrl(unifontDataUrl), { subset: true });
  const bold = regular;
  const mono = regular;
  let page!: PDFPage;
  let width = 0;
  let height = 0;
  let margins = theme.page;
  let y = 0;

  const newPage = (document: ExportDocumentV1) => {
    const pageSize = document.layout?.pageSize ?? theme.page.pageSize;
    const orientation = document.layout?.orientation ?? theme.page.orientation;
    const configured = PAGE_SIZES[pageSize];
    const size = orientation === "landscape"
      ? [configured[1], configured[0]] as [number, number]
      : [...configured] as [number, number];
    const legacyMargin = document.layout?.margin;
    margins = legacyMargin === undefined
      ? theme.page
      : {
          ...theme.page,
          marginBottom: legacyMargin,
          marginLeft: legacyMargin,
          marginRight: legacyMargin,
          marginTop: legacyMargin,
        };
    page = pdf.addPage(size);
    page.setRotation(degrees(0));
    [width, height] = size;
    y = height - margins.marginTop;
  };

  const ensureSpace = (document: ExportDocumentV1, required: number) => {
    if (y - required < margins.marginBottom) newPage(document);
  };

  const drawRuns = (
    document: ExportDocumentV1,
    values: ExportText[],
    options: {
      color?: string;
      font?: PDFFont;
      indent?: number;
      lineHeight?: number;
      size?: number;
      spacing?: number;
    } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? theme.fontSize.body;
    const indent = options.indent ?? 0;
    const lineHeight = size * (options.lineHeight ?? theme.lineHeight.body);
    const lines = wrapRuns(values, font, size, width - margins.marginLeft - margins.marginRight - indent);
    for (const line of lines) {
      ensureSpace(document, lineHeight);
      let x = margins.marginLeft + indent;
      for (const run of line) {
        const runWidth = font.widthOfTextAtSize(run.text, size);
        const fallbackColor = run.marks?.link
          ? theme.colors.link
          : options.color ?? theme.colors.text;
        const color = toColor(
          readableTextColor(run.marks?.color, fallbackColor),
          DEFAULT_PDF_THEME.colors.text,
        );
        if (run.marks?.code && run.text.trim()) {
          page.drawRectangle({
            color: toColor(theme.colors.codeBackground, DEFAULT_PDF_THEME.colors.codeBackground),
            height: lineHeight,
            width: runWidth + 2,
            x: x - 1,
            y: y - size - 1,
          });
        }
        page.drawText(run.text, { color, font: run.marks?.code ? mono : font, size, x, y: y - size });
        if (run.marks?.bold) {
          page.drawText(run.text, { color, font: bold, size, x: x + 0.2, y: y - size });
        }
        if (run.marks?.underline || run.marks?.link) {
          page.drawLine({ color, end: { x: x + runWidth, y: y - size - 1 }, start: { x, y: y - size - 1 }, thickness: 0.6 });
        }
        if (run.marks?.strike) {
          page.drawLine({ color, end: { x: x + runWidth, y: y - size * 0.55 }, start: { x, y: y - size * 0.55 }, thickness: 0.6 });
        }
        x += runWidth;
      }
      y -= lineHeight;
    }
    y -= options.spacing ?? theme.spacing.paragraphGap;
  };

  const drawPlainText = (
    document: ExportDocumentV1,
    text: string,
    options: Parameters<typeof drawRuns>[2] = {},
  ) => drawRuns(document, [{ text }], options);

  const drawCode = (document: ExportDocumentV1, text: string, indent: number) => {
    const size = theme.fontSize.code;
    const padding = theme.spacing.codeBlockPadding;
    const lineHeight = size * theme.lineHeight.body;
    const availableWidth = width - margins.marginLeft - margins.marginRight - indent - padding * 2;
    const lines = wrapRuns([{ text }], mono, size, availableWidth);
    for (const [index, line] of lines.entries()) {
      const topPadding = index === 0 ? padding : 0;
      const bottomPadding = index === lines.length - 1 ? padding : 0;
      const rowHeight = lineHeight + topPadding + bottomPadding;
      ensureSpace(document, rowHeight);
      page.drawRectangle({
        color: toColor(theme.colors.codeBackground, DEFAULT_PDF_THEME.colors.codeBackground),
        height: rowHeight,
        width: availableWidth + padding * 2,
        x: margins.marginLeft + indent,
        y: y - rowHeight,
      });
      page.drawText(line.map((run) => run.text).join(""), {
        color: toColor(readableTextColor(theme.colors.text, DEFAULT_PDF_THEME.colors.text), DEFAULT_PDF_THEME.colors.text),
        font: mono,
        size,
        x: margins.marginLeft + indent + padding,
        y: y - size - topPadding,
      });
      y -= rowHeight;
    }
    y -= theme.spacing.paragraphGap;
  };

  const drawTable = async (document: ExportDocumentV1, rows: Extract<ExportBlock, { type: "table" }>["rows"], indent: number) => {
    const columnCount = Math.max(1, ...rows.map((row) => row.length));
    const tableWidth = width - margins.marginLeft - margins.marginRight - indent;
    const columnWidth = tableWidth / columnCount;
    const padding = 4;
    const size = Math.max(6, theme.fontSize.body - 1);
    const lineHeight = size * theme.lineHeight.body;
    const borderColor = toColor(theme.colors.tableBorder, DEFAULT_PDF_THEME.colors.tableBorder);
    for (const row of rows) {
      await yieldIfNeeded();
      const cells = Array.from({ length: columnCount }, (_, index) => blockText(row[index]?.blocks ?? []));
      const wrapped = cells.map((text) => wrapRuns([{ text }], regular, size, columnWidth - padding * 2));
      const rowHeight = Math.max(lineHeight + padding * 2, ...wrapped.map((lines) => lines.length * lineHeight + padding * 2));
      ensureSpace(document, rowHeight);
      for (let column = 0; column < columnCount; column++) {
        const x = margins.marginLeft + indent + column * columnWidth;
        page.drawRectangle({ borderColor, borderWidth: 0.7, height: rowHeight, width: columnWidth, x, y: y - rowHeight });
        for (const [lineIndex, line] of (wrapped[column] ?? []).entries()) {
          page.drawText(line.map((run) => run.text).join(""), {
            color: toColor(readableTextColor(theme.colors.text, DEFAULT_PDF_THEME.colors.text), DEFAULT_PDF_THEME.colors.text),
            font: regular,
            size,
            x: x + padding,
            y: y - padding - size - lineIndex * lineHeight,
          });
        }
      }
      y -= rowHeight;
    }
    y -= theme.spacing.paragraphGap;
  };

  const drawBlocks = async (document: ExportDocumentV1, blocks: ExportBlock[], indent = 0): Promise<void> => {
    for (const block of blocks) {
      await yieldIfNeeded();
      switch (block.type) {
        case "heading": {
          const size = block.level === 1
            ? theme.fontSize.heading1
            : block.level === 2
              ? theme.fontSize.heading2
              : Math.max(8, theme.fontSize.heading3 - Math.max(0, block.level - 3));
          drawRuns(document, block.children, {
            color: theme.colors.heading,
            font: bold,
            indent,
            lineHeight: theme.lineHeight.heading,
            size,
            spacing: theme.spacing.headingGap,
          });
          break;
        }
        case "paragraph":
          drawRuns(document, block.children, { indent });
          break;
        case "quote": {
          const quotePage = page;
          const startY = y;
          await drawBlocks(document, block.blocks, indent + theme.spacing.listIndent);
          if (page === quotePage) {
            page.drawLine({
              color: toColor(theme.colors.tableBorder, DEFAULT_PDF_THEME.colors.tableBorder),
              end: { x: margins.marginLeft + indent + 4, y: y + theme.spacing.paragraphGap },
              start: { x: margins.marginLeft + indent + 4, y: startY },
              thickness: 2,
            });
          }
          break;
        }
        case "code":
          drawCode(document, block.text, indent);
          break;
        case "list":
          for (const [index, item] of block.items.entries()) {
            await yieldIfNeeded();
            const marker = item.checked === undefined
              ? block.ordered ? `${index + 1}.` : "•"
              : item.checked ? "☑" : "☐";
            ensureSpace(document, theme.fontSize.body * theme.lineHeight.body);
            const markerPage = page;
            const markerY = y;
            await drawBlocks(document, item.blocks, indent + theme.spacing.listIndent);
            markerPage.drawText(marker, {
              color: toColor(readableTextColor(theme.colors.text, DEFAULT_PDF_THEME.colors.text), DEFAULT_PDF_THEME.colors.text),
              font: regular,
              size: theme.fontSize.body,
              x: margins.marginLeft + indent,
              y: markerY - theme.fontSize.body,
            });
          }
          break;
        case "table":
          await drawTable(document, block.rows, indent);
          break;
        case "image": {
          const data = dataUriBytes(block.source);
          if (!data) {
            drawPlainText(document, block.caption ?? block.alt ?? "Image", { indent });
            break;
          }
          const image = data.mimeType === "image/png" ? await pdf.embedPng(data.bytes) : await pdf.embedJpg(data.bytes);
          const maximumHeight = height - margins.marginTop - margins.marginBottom;
          const dimensions = image.scaleToFit(width - margins.marginLeft - margins.marginRight - indent, Math.min(360, maximumHeight));
          ensureSpace(document, dimensions.height + theme.spacing.paragraphGap);
          page.drawImage(image, {
            height: dimensions.height,
            width: dimensions.width,
            x: margins.marginLeft + indent,
            y: y - dimensions.height,
          });
          y -= dimensions.height + theme.spacing.paragraphGap;
          if (block.caption) drawPlainText(document, block.caption, { indent, size: Math.max(7, theme.fontSize.body - 2) });
          break;
        }
        case "divider":
          ensureSpace(document, 12);
          page.drawLine({
            color: toColor(theme.colors.tableBorder, DEFAULT_PDF_THEME.colors.tableBorder),
            end: { x: width - margins.marginRight, y: y - 4 },
            start: { x: margins.marginLeft + indent, y: y - 4 },
            thickness: block.style === "dotted" ? 0.5 : block.style === "dashed" ? 0.7 : 1,
          });
          y -= 12;
          break;
        case "page-break":
          newPage(document);
          break;
      }
    }
  };

  for (const document of documents) {
    await yieldIfNeeded();
    newPage(document);
    drawPlainText(document, document.title || "Untitled", {
      color: theme.colors.heading,
      font: bold,
      lineHeight: theme.lineHeight.heading,
      size: theme.fontSize.title,
      spacing: theme.spacing.headingGap,
    });
    if (document.blocks.length > 0) await drawBlocks(document, document.blocks);
    else drawPlainText(document, "(No content available)");
  }
  if (!documents.length) pdf.addPage(PAGE_SIZES[theme.page.pageSize]);
  if (theme.pageNumbers) {
    const pages = pdf.getPages();
    for (const [index, numberedPage] of pages.entries()) {
      await yieldIfNeeded();
      const { width: pageWidth } = numberedPage.getSize();
      const label = `${index + 1} / ${pages.length}`;
      const size = 9;
      numberedPage.drawText(label, {
        color: toColor(readableTextColor(theme.colors.text, DEFAULT_PDF_THEME.colors.text), DEFAULT_PDF_THEME.colors.text),
        font: regular,
        size,
        x: (pageWidth - regular.widthOfTextAtSize(label, size)) / 2,
        y: 16,
      });
    }
  }
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
