import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runTask: vi.fn() }));

vi.mock("@lunarisapp/plugin-sdk/worker", () => ({
  runPluginWorkerTask: mocks.runTask,
}));

import { renderPdfInWorker } from "./pdf-worker-client";
import { DEFAULT_PDF_THEME } from "./theme";

const documents = [{ blocks: [], title: "Export", version: 1 as const }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runTask.mockResolvedValue(new ArrayBuffer(8));
});

describe("PDF worker client", () => {
  it("renders PDF bytes in an isolated worker", async () => {
    await expect(renderPdfInWorker(documents, DEFAULT_PDF_THEME)).resolves.toBeInstanceOf(
      ArrayBuffer,
    );

    expect(mocks.runTask).toHaveBeenCalledWith(
      expect.any(Function),
      { documents, theme: DEFAULT_PDF_THEME },
      { signal: undefined, timeoutMs: 60_000 },
    );
  });

  it("forwards cancellation to the worker task", async () => {
    const controller = new AbortController();

    await renderPdfInWorker(documents, DEFAULT_PDF_THEME, controller.signal);

    expect(mocks.runTask).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
