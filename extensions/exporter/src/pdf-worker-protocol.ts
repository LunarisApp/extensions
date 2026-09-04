import type { ExportDocumentV1 } from "./contract";
import type { PdfTheme } from "./theme";

export interface PdfWorkerInput {
  documents: ExportDocumentV1[];
  theme: PdfTheme;
}
