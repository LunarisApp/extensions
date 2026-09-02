import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { useEffect, useRef } from "react";

const PREVIEW_SCALE = 1.25;

export function PdfPreview({
  data,
  onError,
  onReady,
}: {
  data: ArrayBuffer;
  onError: (reason: unknown) => void;
  onReady: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  onErrorRef.current = onError;
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    let document: PDFDocumentProxy | undefined;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    const renderTasks = new Set<RenderTask>();

    const render = async () => {
      loadingTask = getDocument({
        data: new Uint8Array(data),
        useWasm: false,
        useWorkerFetch: false,
      });
      document = await loadingTask.promise;
      const pages = window.document.createDocumentFragment();
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        if (cancelled) return;
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: PREVIEW_SCALE });
        const outputScale = window.devicePixelRatio || 1;
        const canvas = window.document.createElement("canvas");
        canvas.className = "exporter-preview-page";
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        canvas.style.width = `${viewport.width}px`;
        const pageContainer = window.document.createElement("div");
        pageContainer.className = "exporter-preview-page-container";
        pageContainer.append(canvas);
        pages.append(pageContainer);
        const task = page.render({
          canvas,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          viewport,
        });
        renderTasks.add(task);
        await task.promise;
        renderTasks.delete(task);
        page.cleanup();
      }
      if (cancelled || !container.current) return;
      container.current.replaceChildren(pages);
      container.current.setAttribute(
        "aria-label",
        `PDF preview, ${document.numPages} ${document.numPages === 1 ? "page" : "pages"}`,
      );
      onReadyRef.current();
    };

    void render().catch((reason) => {
      if (!cancelled) onErrorRef.current(reason);
    });

    return () => {
      cancelled = true;
      for (const task of renderTasks) task.cancel();
      void loadingTask?.destroy();
    };
  }, [data]);

  return <div className="exporter-preview-pages" ref={container} role="img" />;
}
