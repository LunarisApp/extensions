import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import { useEffect, useRef } from "react";

const PREVIEW_SCALE = 1.25;
const PRELOAD_MARGIN = "100% 0px";

function createPageCanvas(
  pageNumber: number,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
): { canvas: HTMLCanvasElement; container: HTMLDivElement } {
  const canvas = window.document.createElement("canvas");
  canvas.className = "exporter-preview-page";
  canvas.dataset.pageNumber = String(pageNumber);
  canvas.height = 1;
  canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
  canvas.style.width = `${viewport.width}px`;
  canvas.width = 1;
  const container = window.document.createElement("div");
  container.className = "exporter-preview-page-container";
  container.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
  container.style.width = `${viewport.width}px`;
  container.append(canvas);
  return { canvas, container };
}

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
    let observer: IntersectionObserver | undefined;
    let renderQueue = Promise.resolve();
    const renderTasks = new Set<RenderTask>();
    const renderedPages = new Set<number>();

    const renderPage = async (
      pageNumber: number,
      canvas: HTMLCanvasElement,
      loadedPage?: PDFPageProxy,
    ) => {
      if (cancelled || renderedPages.has(pageNumber) || !document) return;
      renderedPages.add(pageNumber);
      let page = loadedPage;
      try {
        page ??= await document.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: PREVIEW_SCALE });
        const outputScale = window.devicePixelRatio || 1;
        const pageContainer = canvas.parentElement;
        if (pageContainer) {
          pageContainer.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
          pageContainer.style.width = `${viewport.width}px`;
        }
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        const task = page.render({
          canvas,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          viewport,
        });
        renderTasks.add(task);
        await task.promise.finally(() => renderTasks.delete(task));
      } catch (reason) {
        renderedPages.delete(pageNumber);
        if (!cancelled) throw reason;
      } finally {
        page?.cleanup();
      }
    };

    const render = async () => {
      loadingTask = getDocument({
        data: new Uint8Array(data),
        useWasm: false,
        useWorkerFetch: false,
      });
      document = await loadingTask.promise;
      if (cancelled || !container.current) return;

      const firstPage = await document.getPage(1);
      if (cancelled || !container.current) {
        firstPage.cleanup();
        return;
      }
      const firstViewport = firstPage.getViewport({ scale: PREVIEW_SCALE });
      const pages = window.document.createDocumentFragment();
      const canvases: HTMLCanvasElement[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = createPageCanvas(pageNumber, firstViewport);
        canvases.push(page.canvas);
        pages.append(page.container);
      }
      container.current.replaceChildren(pages);
      container.current.setAttribute(
        "aria-label",
        `PDF preview, ${document.numPages} ${document.numPages === 1 ? "page" : "pages"}`,
      );

      await renderPage(1, canvases[0]!, firstPage);
      if (cancelled) return;
      onReadyRef.current();

      if (typeof IntersectionObserver === "undefined") {
        for (let index = 1; index < canvases.length; index += 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
          await renderPage(index + 1, canvases[index]!);
        }
        return;
      }

      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          const canvas = entry.target.querySelector<HTMLCanvasElement>("canvas");
          const pageNumber = Number(canvas?.dataset.pageNumber);
          if (!canvas || !Number.isInteger(pageNumber)) continue;
          renderQueue = renderQueue
            .then(() => renderPage(pageNumber, canvas))
            .catch((reason) => {
              if (!cancelled) onErrorRef.current(reason);
            });
        }
      }, { root: container.current, rootMargin: PRELOAD_MARGIN });
      for (const canvas of canvases.slice(1)) observer.observe(canvas.parentElement!);
    };

    void render().catch((reason) => {
      if (!cancelled) onErrorRef.current(reason);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      for (const task of renderTasks) task.cancel();
      void loadingTask?.destroy();
    };
  }, [data]);

  return <div className="exporter-preview-pages" ref={container} role="img" />;
}
