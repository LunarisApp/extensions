import { exposePluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";
import { renderPdf } from "./pdf";
import type { PdfWorkerInput } from "./pdf-worker-protocol";

exposePluginWorkerTask<PdfWorkerInput, ArrayBuffer>(({ documents, theme }) =>
  renderPdf(documents, theme),
);
