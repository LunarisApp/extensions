import { type PluginResourceData, type PluginServiceSlotContribution } from "@lunarisapp/plugin-sdk";
export declare const EXPORTER_EXTENSION_ID = "lunaris.exporter";
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
export type ExportBlock = {
    children: ExportText[];
    level: 1 | 2 | 3 | 4 | 5 | 6;
    type: "heading";
} | {
    children: ExportText[];
    type: "paragraph";
} | {
    blocks: ExportBlock[];
    type: "quote";
} | {
    language?: string;
    text: string;
    type: "code";
} | {
    items: Array<{
        blocks: ExportBlock[];
        checked?: boolean;
    }>;
    ordered: boolean;
    type: "list";
} | {
    rows: Array<Array<{
        blocks: ExportBlock[];
    }>>;
    type: "table";
} | {
    alt?: string;
    caption?: string;
    source: string;
    type: "image";
} | {
    style?: "dashed" | "dotted" | "solid";
    type: "divider";
} | {
    type: "page-break";
};
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
export declare function isExporterRepresentationMetadata(value: unknown): value is ExporterRepresentationMetadata;
export declare function assertExportDocumentV1(value: unknown): asserts value is ExportDocumentV1;
export type ExporterRepresentation = PluginServiceSlotContribution<ExporterRepresentationMetadata, ExportResourceSnapshot, ExportDocumentV1>;
export declare const exporterService: import("@lunarisapp/plugin-sdk").PluginServiceDefinition<Readonly<Record<string, import("@lunarisapp/plugin-sdk").PluginServiceMethod>>>;
export declare const exporterRepresentations: import("@lunarisapp/plugin-sdk").PluginServiceSlotDefinition<ExporterRepresentationMetadata, ExportResourceSnapshot, ExportDocumentV1>;
//# sourceMappingURL=contract.d.ts.map