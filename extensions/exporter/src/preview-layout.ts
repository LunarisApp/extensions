import type { ExportBlock, ExportDocumentV1, ExportText, ExportTextMark } from "./contract";
import type { PdfTheme } from "./theme";

export const PREVIEW_PAGE_SIZES: Record<"a4" | "letter", [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

export interface TextMeasureStyle {
  bold?: boolean;
  code?: boolean;
  italic?: boolean;
  size: number;
}

export type TextMeasurer = (text: string, style: TextMeasureStyle) => number;

export interface PreviewImageMetadata {
  height: number;
  width: number;
}

interface FragmentBase {
  height: number;
  indent: number;
  marker?: string;
  quoteDepth: number;
  spacingAfter: number;
}

export interface PreviewTextFragment extends FragmentBase {
  kind: "caption" | "code" | "heading" | "paragraph" | "title";
  lineHeight: number;
  paddingBottom: number;
  paddingInline: number;
  paddingTop: number;
  runs: ExportText[];
  size: number;
  type: "text";
}

export interface PreviewTableFragment extends FragmentBase {
  cells: string[][];
  lineHeight: number;
  type: "table-row";
}

export interface PreviewImageFragment extends FragmentBase {
  alt: string;
  source: string;
  type: "image";
  width: number;
}

export interface PreviewDividerFragment extends FragmentBase {
  style: "dashed" | "dotted" | "solid";
  type: "divider";
}

export type PreviewFragment =
  | PreviewDividerFragment
  | PreviewImageFragment
  | PreviewTableFragment
  | PreviewTextFragment;

export interface PreviewPage {
  fragments: PreviewFragment[];
  height: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  width: number;
}

interface PageGeometry extends Omit<PreviewPage, "fragments"> {
  contentHeight: number;
  contentWidth: number;
}

interface LayoutContext {
  geometry: PageGeometry;
  imageMetadata: ReadonlyMap<string, PreviewImageMetadata | null>;
  measure: TextMeasurer;
  theme: PdfTheme;
}

function sameMarks(left: ExportTextMark | undefined, right: ExportTextMark | undefined) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

function appendRun(runs: ExportText[], text: string, marks?: ExportTextMark) {
  if (!text) return;
  const previous = runs.at(-1);
  if (previous && sameMarks(previous.marks, marks)) previous.text += text;
  else runs.push(marks ? { marks, text } : { text });
}

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)]
      .map(({ segment }) => segment);
  }
  return Array.from(value);
}

export function wrapPreviewText(
  values: readonly ExportText[],
  maximumWidth: number,
  size: number,
  measure: TextMeasurer,
): ExportText[][] {
  const lines: ExportText[][] = [[]];
  let lineWidth = 0;
  const nextLine = () => {
    lines.push([]);
    lineWidth = 0;
  };
  const add = (text: string, marks?: ExportTextMark) => {
    appendRun(lines.at(-1)!, text, marks);
    lineWidth += measure(text, { ...marks, size });
  };

  for (const value of values) {
    const tokens = value.text.replaceAll("\t", "  ").split(/(\r\n|\r|\n|[^\S\r\n]+)/);
    for (const token of tokens) {
      if (!token) continue;
      if (token === "\n" || token === "\r" || token === "\r\n") {
        nextLine();
        continue;
      }
      const whitespace = /^\s+$/.test(token);
      const normalized = whitespace ? " " : token;
      if (whitespace && lineWidth === 0) continue;
      const tokenWidth = measure(normalized, { ...value.marks, size });
      if (!whitespace && lineWidth > 0 && lineWidth + tokenWidth > maximumWidth) nextLine();
      if (!whitespace && tokenWidth > maximumWidth) {
        for (const character of graphemes(normalized)) {
          const width = measure(character, { ...value.marks, size });
          if (lineWidth > 0 && lineWidth + width > maximumWidth) nextLine();
          add(character, value.marks);
        }
      } else {
        add(normalized, value.marks);
      }
    }
  }
  return lines.length ? lines : [[]];
}

function blockText(blocks: readonly ExportBlock[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case "heading":
      case "paragraph":
        return block.children.map(({ text }) => text).join("");
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

function textFragments(
  values: readonly ExportText[],
  context: LayoutContext,
  options: {
    indent?: number;
    kind?: PreviewTextFragment["kind"];
    lineHeight?: number;
    marker?: string;
    padding?: number;
    quoteDepth?: number;
    size?: number;
    spacing?: number;
  } = {},
): PreviewTextFragment[] {
  const indent = options.indent ?? 0;
  const size = options.size ?? context.theme.fontSize.body;
  const lineHeight = size * (options.lineHeight ?? context.theme.lineHeight.body);
  const padding = options.padding ?? 0;
  const maximumWidth = Math.max(1, context.geometry.contentWidth - indent - padding * 2);
  const lines = wrapPreviewText(values, maximumWidth, size, context.measure);
  return lines.map((runs, index) => ({
    height: lineHeight + (index === 0 ? padding : 0) + (index === lines.length - 1 ? padding : 0),
    indent,
    kind: options.kind ?? "paragraph",
    lineHeight,
    marker: index === 0 ? options.marker : undefined,
    paddingBottom: index === lines.length - 1 ? padding : 0,
    paddingInline: padding,
    paddingTop: index === 0 ? padding : 0,
    quoteDepth: options.quoteDepth ?? 0,
    runs,
    size,
    spacingAfter: index === lines.length - 1
      ? options.spacing ?? context.theme.spacing.paragraphGap
      : 0,
    type: "text",
  }));
}

function tableFragments(
  rows: Extract<ExportBlock, { type: "table" }>["rows"],
  context: LayoutContext,
  indent: number,
  quoteDepth: number,
): PreviewTableFragment[] {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const padding = 4;
  const size = Math.max(6, context.theme.fontSize.body - 1);
  const lineHeight = size * context.theme.lineHeight.body;
  const columnWidth = (context.geometry.contentWidth - indent) / columnCount;
  const maximumLines = Math.max(1, Math.floor((context.geometry.contentHeight - padding * 2) / lineHeight));
  const fragments: PreviewTableFragment[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    const cells = Array.from({ length: columnCount }, (_, index) =>
      wrapPreviewText(
        [{ text: blockText(row[index]?.blocks ?? []) }],
        Math.max(1, columnWidth - padding * 2),
        size,
        context.measure,
      ).map((line) => line.map(({ text }) => text).join(""))
    );
    const lineCount = Math.max(1, ...cells.map((cell) => cell.length));
    for (let offset = 0; offset < lineCount; offset += maximumLines) {
      const chunk = cells.map((cell) => cell.slice(offset, offset + maximumLines));
      const chunkLines = Math.max(1, ...chunk.map((cell) => cell.length));
      fragments.push({
        cells: chunk,
        height: chunkLines * lineHeight + padding * 2,
        indent,
        lineHeight,
        quoteDepth,
        spacingAfter: rowIndex === rows.length - 1 && offset + maximumLines >= lineCount
          ? context.theme.spacing.paragraphGap
          : 0,
        type: "table-row",
      });
    }
  }
  return fragments;
}

function blockFragments(
  blocks: readonly ExportBlock[],
  context: LayoutContext,
  indent = 0,
  quoteDepth = 0,
): Array<PreviewFragment | "page-break"> {
  const fragments: Array<PreviewFragment | "page-break"> = [];
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const size = block.level === 1
          ? context.theme.fontSize.heading1
          : block.level === 2
            ? context.theme.fontSize.heading2
            : Math.max(8, context.theme.fontSize.heading3 - Math.max(0, block.level - 3));
        fragments.push(...textFragments(block.children, context, {
          indent,
          kind: "heading",
          lineHeight: context.theme.lineHeight.heading,
          quoteDepth,
          size,
          spacing: context.theme.spacing.headingGap,
        }));
        break;
      }
      case "paragraph":
        fragments.push(...textFragments(block.children, context, { indent, quoteDepth }));
        break;
      case "quote":
        fragments.push(...blockFragments(
          block.blocks,
          context,
          indent + context.theme.spacing.listIndent,
          quoteDepth + 1,
        ));
        break;
      case "code":
        fragments.push(...textFragments([{ marks: { code: true }, text: block.text }], context, {
          indent,
          kind: "code",
          padding: context.theme.spacing.codeBlockPadding,
          quoteDepth,
          size: context.theme.fontSize.code,
        }));
        break;
      case "list":
        for (const [index, item] of block.items.entries()) {
          const marker = item.checked === undefined
            ? block.ordered ? `${index + 1}.` : "•"
            : item.checked ? "☑" : "☐";
          const itemFragments = blockFragments(
            item.blocks,
            context,
            indent + context.theme.spacing.listIndent,
            quoteDepth,
          );
          const first = itemFragments.find((fragment) => fragment !== "page-break");
          if (first) first.marker = marker;
          fragments.push(...itemFragments);
        }
        break;
      case "table":
        fragments.push(...tableFragments(block.rows, context, indent, quoteDepth));
        break;
      case "image": {
        const metadata = context.imageMetadata.get(block.source);
        if (
          !metadata ||
          !Number.isFinite(metadata.height) ||
          !Number.isFinite(metadata.width) ||
          metadata.height <= 0 ||
          metadata.width <= 0
        ) {
          fragments.push(...textFragments([{ text: block.caption ?? block.alt ?? "Image" }], context, {
            indent,
            quoteDepth,
          }));
          break;
        }
        const maximumWidth = Math.max(1, context.geometry.contentWidth - indent);
        const scale = Math.min(
          maximumWidth / metadata.width,
          Math.min(360, context.geometry.contentHeight) / metadata.height,
          1,
        );
        const width = metadata.width * scale;
        const height = metadata.height * scale;
        fragments.push({
          alt: block.alt ?? block.caption ?? "",
          height,
          indent,
          quoteDepth,
          source: block.source,
          spacingAfter: context.theme.spacing.paragraphGap,
          type: "image",
          width,
        });
        if (block.caption) {
          fragments.push(...textFragments([{ text: block.caption }], context, {
            indent,
            kind: "caption",
            quoteDepth,
            size: Math.max(7, context.theme.fontSize.body - 2),
          }));
        }
        break;
      }
      case "divider":
        fragments.push({
          height: 12,
          indent,
          quoteDepth,
          spacingAfter: 0,
          style: block.style ?? "solid",
          type: "divider",
        });
        break;
      case "page-break":
        fragments.push("page-break");
        break;
    }
  }
  return fragments;
}

function pageGeometry(document: ExportDocumentV1, theme: PdfTheme): PageGeometry {
  const pageSize = document.layout?.pageSize ?? theme.page.pageSize;
  const orientation = document.layout?.orientation ?? theme.page.orientation;
  const configured = PREVIEW_PAGE_SIZES[pageSize];
  const [width, height] = orientation === "landscape"
    ? [configured[1], configured[0]]
    : configured;
  const legacyMargin = document.layout?.margin;
  const marginTop = legacyMargin ?? theme.page.marginTop;
  const marginRight = legacyMargin ?? theme.page.marginRight;
  const marginBottom = legacyMargin ?? theme.page.marginBottom;
  const marginLeft = legacyMargin ?? theme.page.marginLeft;
  return {
    contentHeight: Math.max(1, height - marginTop - marginBottom),
    contentWidth: Math.max(1, width - marginLeft - marginRight),
    height,
    marginBottom,
    marginLeft,
    marginRight,
    marginTop,
    width,
  };
}

export function previewLayoutKey(theme: PdfTheme): string {
  return JSON.stringify({
    fontSize: theme.fontSize,
    lineHeight: theme.lineHeight,
    page: theme.page,
    spacing: theme.spacing,
  });
}

export function paginatePreview(
  documents: readonly ExportDocumentV1[],
  theme: PdfTheme,
  measure: TextMeasurer,
  imageMetadata: ReadonlyMap<string, PreviewImageMetadata | null> = new Map(),
): PreviewPage[] {
  const pages: PreviewPage[] = [];
  for (const document of documents) {
    const geometry = pageGeometry(document, theme);
    const context: LayoutContext = { geometry, imageMetadata, measure, theme };
    let page: PreviewPage;
    let used = 0;
    const newPage = () => {
      page = {
        fragments: [],
        height: geometry.height,
        marginBottom: geometry.marginBottom,
        marginLeft: geometry.marginLeft,
        marginRight: geometry.marginRight,
        marginTop: geometry.marginTop,
        width: geometry.width,
      };
      pages.push(page);
      used = 0;
    };
    const add = (fragment: PreviewFragment) => {
      const required = fragment.height + fragment.spacingAfter;
      if (page.fragments.length > 0 && used + required > geometry.contentHeight) newPage();
      page.fragments.push(fragment);
      used += required;
    };

    newPage();
    for (const fragment of textFragments([{ text: document.title || "Untitled" }], context, {
      kind: "title",
      lineHeight: theme.lineHeight.heading,
      size: theme.fontSize.title,
      spacing: theme.spacing.headingGap,
    })) add(fragment);
    const blocks = document.blocks.length
      ? blockFragments(document.blocks, context)
      : textFragments([{ text: "(No content available)" }], context);
    for (const fragment of blocks) {
      if (fragment === "page-break") newPage();
      else add(fragment);
    }
  }
  return pages;
}
