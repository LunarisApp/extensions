import {
  definePluginService,
  type PluginResourceData,
  type PluginServiceSlotContribution,
} from "@lunarisapp/plugin-sdk";

export const EXPORTER_EXTENSION_ID = "lunaris.exporter";

export interface ExportTextMark {
  bold?: boolean;
  code?: boolean;
  color?: string;
  italic?: boolean;
  link?: string;
  strike?: boolean;
  underline?: boolean;
}

export interface ExportText {
  marks?: ExportTextMark;
  text: string;
}

export type ExportBlock =
  | { children: ExportText[]; level: 1 | 2 | 3 | 4 | 5 | 6; type: "heading" }
  | { children: ExportText[]; type: "paragraph" }
  | { blocks: ExportBlock[]; type: "quote" }
  | { language?: string; text: string; type: "code" }
  | {
      items: Array<{ blocks: ExportBlock[]; checked?: boolean }>;
      ordered: boolean;
      type: "list";
    }
  | { rows: Array<Array<{ blocks: ExportBlock[] }>>; type: "table" }
  | { alt?: string; caption?: string; source: string; type: "image" }
  | { style?: "dashed" | "dotted" | "solid"; type: "divider" }
  | { type: "page-break" };

export interface ExportDocumentLayout {
  margin?: number;
  orientation?: "landscape" | "portrait";
  pageSize?: "a4" | "letter";
}

export interface ExportDocumentV1 {
  blocks: ExportBlock[];
  layout?: ExportDocumentLayout;
  title: string;
  version: 1;
}

export interface ExportResourceSnapshot {
  children: ExportResourceSnapshot[];
  resource: PluginResourceData;
  yjsUpdates: Record<string, string[]>;
}

export interface ExporterRepresentationMetadata {
  label: string;
  resourceTypeIds: string[];
}

export function isExporterRepresentationMetadata(
  value: unknown,
): value is ExporterRepresentationMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as ExporterRepresentationMetadata;
  return (
    typeof metadata.label === "string" &&
    metadata.label.trim().length > 0 &&
    Array.isArray(metadata.resourceTypeIds) &&
    metadata.resourceTypeIds.length > 0 &&
    metadata.resourceTypeIds.every(
      (resourceTypeId) =>
        typeof resourceTypeId === "string" && resourceTypeId.length > 0,
    )
  );
}

function isText(value: unknown): value is ExportText {
  if (!value || typeof value !== "object") return false;
  const text = value as ExportText;
  if (typeof text.text !== "string") return false;
  if (text.marks === undefined) return true;
  if (!text.marks || typeof text.marks !== "object") return false;
  return (
    ["bold", "code", "italic", "strike", "underline"] as const
  ).every(
    (key) =>
      text.marks?.[key] === undefined ||
      typeof text.marks[key] === "boolean",
  ) &&
    (["color", "link"] as const).every(
      (key) =>
        text.marks?.[key] === undefined ||
        typeof text.marks[key] === "string",
    );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isBlock(value: unknown): value is ExportBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<ExportBlock>;
  switch (block.type) {
    case "heading":
      return Array.isArray(block.children) && block.children.every(isText) &&
        Number.isInteger(block.level) && Number(block.level) >= 1 && Number(block.level) <= 6;
    case "paragraph":
      return Array.isArray(block.children) && block.children.every(isText);
    case "quote":
      return Array.isArray(block.blocks) && block.blocks.every(isBlock);
    case "code":
      return typeof block.text === "string" && isOptionalString(block.language);
    case "list":
      return typeof block.ordered === "boolean" && Array.isArray(block.items) &&
        block.items.every((item) => Boolean(
          item &&
          (item.checked === undefined || typeof item.checked === "boolean") &&
          Array.isArray(item.blocks) &&
          item.blocks.every(isBlock),
        ));
    case "table":
      return Array.isArray(block.rows) && block.rows.every((row) =>
        Array.isArray(row) && row.every((cell) => Boolean(cell && Array.isArray(cell.blocks) && cell.blocks.every(isBlock))));
    case "image":
      return typeof block.source === "string" &&
        isOptionalString(block.alt) &&
        isOptionalString(block.caption);
    case "divider":
      return block.style === undefined ||
        block.style === "dashed" ||
        block.style === "dotted" ||
        block.style === "solid";
    case "page-break":
      return true;
    default:
      return false;
  }
}

function isLayout(value: unknown): value is ExportDocumentLayout {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const layout = value as ExportDocumentLayout;
  return (
    (layout.margin === undefined ||
      (Number.isFinite(layout.margin) && Number(layout.margin) >= 0)) &&
    (layout.orientation === undefined ||
      layout.orientation === "landscape" ||
      layout.orientation === "portrait") &&
    (layout.pageSize === undefined ||
      layout.pageSize === "a4" ||
      layout.pageSize === "letter")
  );
}

export function assertExportDocumentV1(
  value: unknown,
): asserts value is ExportDocumentV1 {
  if (
    !value ||
    typeof value !== "object" ||
    (value as Partial<ExportDocumentV1>).version !== 1 ||
    typeof (value as Partial<ExportDocumentV1>).title !== "string" ||
    !isLayout((value as Partial<ExportDocumentV1>).layout) ||
    !Array.isArray((value as Partial<ExportDocumentV1>).blocks) ||
    !(value as Partial<ExportDocumentV1>).blocks?.every(isBlock)
  ) {
    throw new Error("Invalid lunaris.exporter document version 1");
  }
}

export type ExporterRepresentation = PluginServiceSlotContribution<
  ExporterRepresentationMetadata,
  ExportResourceSnapshot,
  ExportDocumentV1
>;

export const exporterService = definePluginService({
  id: EXPORTER_EXTENSION_ID,
  methods: [],
  version: "0.0.1",
});

export const exporterRepresentations = exporterService.slot<
  ExporterRepresentationMetadata,
  ExportResourceSnapshot,
  ExportDocumentV1
>("representations");
