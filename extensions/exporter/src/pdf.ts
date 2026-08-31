import unifontDataUrl from "@fontsource/unifont/files/unifont-latin-400-normal.woff2?inline";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ExportBlock, ExportDocumentV1, ExportText } from "./contract";

const PAGE_SIZES: Record<"a4" | "letter", [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

function plainText(values: ExportText[]): string {
  return values.map(({ text }) => text).join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replaceAll("\t", "  ").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function dataUriBytes(source: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(source);
  if (!match?.[1] || !match[2]) return null;
  return {
    bytes: Uint8Array.from(atob(match[2]), (value) => value.charCodeAt(0)),
    mimeType: match[1].toLowerCase(),
  };
}

function decodeDataUrl(source: string): Uint8Array {
  const encoded = source.split(",", 2)[1];
  if (!encoded) throw new Error("Bundled PDF font is unavailable");
  return Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
}

export async function renderPdf(documents: ExportDocumentV1[]): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(decodeDataUrl(unifontDataUrl), {
    subset: true,
  });
  const bold = regular;
  const mono = regular;
  let page!: PDFPage;
  let width = 0;
  let height = 0;
  let margin = 42;
  let y = 0;

  const newPage = (document: ExportDocumentV1) => {
    const configured = PAGE_SIZES[document.layout?.pageSize ?? "a4"];
    const size = document.layout?.orientation === "landscape"
      ? [configured[1], configured[0]] as [number, number]
      : [...configured] as [number, number];
    page = pdf.addPage(size);
    [width, height] = size;
    margin = Math.min(96, Math.max(18, document.layout?.margin ?? 42));
    y = height - margin;
  };

  const ensureSpace = (document: ExportDocumentV1, required: number) => {
    if (y - required < margin) newPage(document);
  };

  const drawText = (
    document: ExportDocumentV1,
    text: string,
    options: { font?: PDFFont; indent?: number; size?: number; spacing?: number } = {},
  ) => {
    const font = options.font ?? regular;
    const size = options.size ?? 11;
    const indent = options.indent ?? 0;
    const lineHeight = size * 1.35;
    const lines = wrap(text, font, size, width - margin * 2 - indent);
    ensureSpace(document, lines.length * lineHeight + (options.spacing ?? 5));
    for (const line of lines) {
      page.drawText(line, { color: rgb(0.09, 0.09, 0.11), font, size, x: margin + indent, y: y - size });
      y -= lineHeight;
    }
    y -= options.spacing ?? 5;
  };

  const drawBlocks = async (document: ExportDocumentV1, blocks: ExportBlock[], indent = 0): Promise<void> => {
    for (const block of blocks) {
      switch (block.type) {
        case "heading":
          drawText(document, plainText(block.children), { font: bold, indent, size: block.level === 1 ? 20 : block.level === 2 ? 16 : 13, spacing: 8 });
          break;
        case "paragraph":
          drawText(document, plainText(block.children), { indent });
          break;
        case "quote":
          await drawBlocks(document, block.blocks, indent + 14);
          break;
        case "code":
          drawText(document, block.text, { font: mono, indent: indent + 8, size: 9, spacing: 8 });
          break;
        case "list":
          for (const [index, item] of block.items.entries()) {
            const marker = item.checked === undefined ? (block.ordered ? `${index + 1}.` : "-") : item.checked ? "[x]" : "[ ]";
            drawText(document, marker, { indent, spacing: 0 });
            await drawBlocks(document, item.blocks, indent + 20);
          }
          break;
        case "table":
          for (const row of block.rows) {
            drawText(document, row.map((cell) => cell.blocks.map((value) => value.type === "paragraph" ? plainText(value.children) : "").join(" ")).join("  |  "), { indent, size: 9, spacing: 3 });
          }
          y -= 5;
          break;
        case "image": {
          const data = dataUriBytes(block.source);
          if (!data) {
            drawText(document, block.caption ?? block.alt ?? "Image", { indent });
            break;
          }
          const image = data.mimeType === "image/png"
            ? await pdf.embedPng(data.bytes)
            : await pdf.embedJpg(data.bytes);
          const dimensions = image.scaleToFit(width - margin * 2 - indent, 360);
          ensureSpace(document, dimensions.height + 8);
          page.drawImage(image, { height: dimensions.height, width: dimensions.width, x: margin + indent, y: y - dimensions.height });
          y -= dimensions.height + 8;
          break;
        }
        case "divider":
          ensureSpace(document, 12);
          page.drawLine({ color: rgb(0.75, 0.75, 0.78), end: { x: width - margin, y: y - 4 }, start: { x: margin + indent, y: y - 4 }, thickness: 0.8 });
          y -= 12;
          break;
        case "page-break":
          newPage(document);
          break;
      }
    }
  };

  for (const document of documents) {
    newPage(document);
    drawText(document, document.title, { font: bold, size: 24, spacing: 14 });
    await drawBlocks(document, document.blocks);
  }
  if (!documents.length) pdf.addPage(PAGE_SIZES.a4);
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
