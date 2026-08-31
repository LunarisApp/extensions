import { describe, expect, it } from "vitest";
import {
  assertExportDocumentV1,
  exporterRepresentations,
  exporterService,
  isExporterRepresentationMetadata,
} from "./contract";

describe("exporter contract", () => {
  it("owns a versioned representation slot", () => {
    expect(exporterService.id).toBe("lunaris.exporter");
    expect(exporterService.version).toBe("0.0.1");
    expect(exporterRepresentations.id).toBe("representations");
    expect(isExporterRepresentationMetadata({
      label: "Notes",
      resourceTypeIds: ["acme.notes"],
    })).toBe(true);
    expect(isExporterRepresentationMetadata({
      label: "Notes",
      resourceTypeIds: "acme.notes",
    })).toBe(false);
  });

  it("validates provider-neutral semantic documents", () => {
    expect(() => assertExportDocumentV1({
      blocks: [
        { children: [{ marks: { bold: true }, text: "Overview" }], level: 1, type: "heading" },
        { rows: [[{ blocks: [{ children: [{ text: "Value" }], type: "paragraph" }] }]], type: "table" },
      ],
      layout: { margin: 36, pageSize: "a4" },
      title: "Report",
      version: 1,
    })).not.toThrow();
    expect(() => assertExportDocumentV1({
      blocks: [{ payload: { provider: "private-format" }, type: "native" }],
      title: "Bad",
      version: 1,
    })).toThrow("Invalid lunaris.exporter document");
    expect(() => assertExportDocumentV1({
      blocks: [],
      layout: { pageSize: "legal" },
      title: "Bad layout",
      version: 1,
    })).toThrow("Invalid lunaris.exporter document");
    expect(() => assertExportDocumentV1({
      blocks: [{
        children: [{ marks: { bold: "yes" }, text: "Invalid" }],
        type: "paragraph",
      }],
      title: "Bad marks",
      version: 1,
    })).toThrow("Invalid lunaris.exporter document");
  });
});
