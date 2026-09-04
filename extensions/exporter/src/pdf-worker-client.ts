import { runPluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";
import PdfWorker from "./pdf.worker?worker&inline";
import type { ExportDocumentV1 } from "./contract";
import type { PdfWorkerInput } from "./pdf-worker-protocol";
import type { PdfTheme } from "./theme";

const PDF_WORKER_TIMEOUT_MS = 60_000;

function createPdfWorker(): Worker {
  return new PdfWorker({ name: "lunaris-exporter-pdf" });
}

export function renderPdfInWorker(
  documents: ExportDocumentV1[],
  theme: PdfTheme,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return runPluginWorkerTask<PdfWorkerInput, ArrayBuffer>(
    createPdfWorker,
    { documents, theme },
    { signal, timeoutMs: PDF_WORKER_TIMEOUT_MS },
  );
}
