import { definePluginService, } from "@lunarisapp/plugin-sdk";
export const EXPORTER_EXTENSION_ID = "lunaris.exporter";
export function isExporterRepresentationMetadata(value) {
    if (!value || typeof value !== "object")
        return false;
    const metadata = value;
    return (typeof metadata.label === "string" &&
        metadata.label.trim().length > 0 &&
        Array.isArray(metadata.resourceTypeIds) &&
        metadata.resourceTypeIds.length > 0 &&
        metadata.resourceTypeIds.every((resourceTypeId) => typeof resourceTypeId === "string" && resourceTypeId.length > 0));
}
function isText(value) {
    if (!value || typeof value !== "object")
        return false;
    const text = value;
    if (typeof text.text !== "string")
        return false;
    if (text.marks === undefined)
        return true;
    if (!text.marks || typeof text.marks !== "object")
        return false;
    return ["bold", "code", "italic", "strike", "underline"].every((key) => text.marks?.[key] === undefined ||
        typeof text.marks[key] === "boolean") &&
        ["color", "link"].every((key) => text.marks?.[key] === undefined ||
            typeof text.marks[key] === "string");
}
function isOptionalString(value) {
    return value === undefined || typeof value === "string";
}
function isBlock(value) {
    if (!value || typeof value !== "object")
        return false;
    const block = value;
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
                block.items.every((item) => Boolean(item &&
                    (item.checked === undefined || typeof item.checked === "boolean") &&
                    Array.isArray(item.blocks) &&
                    item.blocks.every(isBlock)));
        case "table":
            return Array.isArray(block.rows) && block.rows.every((row) => Array.isArray(row) && row.every((cell) => Boolean(cell && Array.isArray(cell.blocks) && cell.blocks.every(isBlock))));
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
function isLayout(value) {
    if (value === undefined)
        return true;
    if (!value || typeof value !== "object")
        return false;
    const layout = value;
    return ((layout.margin === undefined ||
        (Number.isFinite(layout.margin) && Number(layout.margin) >= 0)) &&
        (layout.orientation === undefined ||
            layout.orientation === "landscape" ||
            layout.orientation === "portrait") &&
        (layout.pageSize === undefined ||
            layout.pageSize === "a4" ||
            layout.pageSize === "letter"));
}
export function assertExportDocumentV1(value) {
    if (!value ||
        typeof value !== "object" ||
        value.version !== 1 ||
        typeof value.title !== "string" ||
        !isLayout(value.layout) ||
        !Array.isArray(value.blocks) ||
        !value.blocks?.every(isBlock)) {
        throw new Error("Invalid lunaris.exporter document version 1");
    }
}
export const exporterService = definePluginService({
    id: EXPORTER_EXTENSION_ID,
    methods: [],
    version: "0.0.1",
});
export const exporterRepresentations = exporterService.slot("representations");
