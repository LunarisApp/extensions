import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { ExportDocumentV1, ExportText } from "./contract";
import {
  paginatePreview,
  previewLayoutKey,
  type PreviewFragment,
  type PreviewImageMetadata,
  type PreviewPage,
  type PreviewTextFragment,
  type TextMeasurer,
} from "./preview-layout";
import { readableTextColor } from "./text-color";
import { DEFAULT_PDF_THEME, type PdfTheme } from "./theme";

const PAGE_SCALE_LIMIT = 1.25;
const PAGE_HORIZONTAL_GUTTER = 32;
const PAGE_PRELOAD_MARGIN = "100% 0px";
let measurementContext: CanvasRenderingContext2D | null | undefined;

function devMeasure(name: string, start: number) {
  if (import.meta.env.DEV && typeof performance !== "undefined") {
    performance.measure(name, { end: performance.now(), start });
  }
}

export const browserTextMeasurer: TextMeasurer = (text, style) => {
  if (measurementContext === undefined) {
    try {
      measurementContext = document.createElement("canvas").getContext("2d");
    } catch {
      measurementContext = null;
    }
  }
  if (!measurementContext) return Array.from(text).length * style.size * (style.code ? 0.62 : 0.54);
  measurementContext.font = [
    style.italic ? "italic" : "normal",
    style.bold ? "700" : "400",
    `${style.size}px`,
    style.code ? "ui-monospace, monospace" : "system-ui, sans-serif",
  ].join(" ");
  return measurementContext.measureText(text).width;
};

function imageSources(documents: readonly ExportDocumentV1[]): string[] {
  const sources = new Set<string>();
  const visit = (blocks: ExportDocumentV1["blocks"]) => {
    for (const block of blocks) {
      if (block.type === "image") sources.add(block.source);
      if (block.type === "quote") visit(block.blocks);
      if (block.type === "list") {
        for (const item of block.items) visit(item.blocks);
      }
      if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row) visit(cell.blocks);
        }
      }
    }
  };
  for (const document of documents) visit(document.blocks);
  return [...sources];
}

function loadImageMetadata(source: string): Promise<PreviewImageMetadata | null> {
  if (!/^data:image\/(?:png|jpeg);base64,/i.test(source)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve(null);
    image.onload = () => resolve(
      image.naturalWidth > 0 && image.naturalHeight > 0
        ? { height: image.naturalHeight, width: image.naturalWidth }
        : null,
    );
    image.src = source;
  });
}

function TextRuns({ fallbackColor, runs, theme }: {
  fallbackColor: string;
  runs: readonly ExportText[];
  theme: PdfTheme;
}) {
  return runs.map((run, index) => {
    const marks = run.marks;
    const style: CSSProperties = {
      color: readableTextColor(marks?.color, marks?.link ? theme.colors.link : fallbackColor),
      fontStyle: marks?.italic ? "italic" : undefined,
      fontWeight: marks?.bold ? 700 : undefined,
      textDecoration: [
        marks?.underline || marks?.link ? "underline" : "",
        marks?.strike ? "line-through" : "",
      ].filter(Boolean).join(" ") || undefined,
    };
    return marks?.code
      ? <code key={index} style={style}>{run.text}</code>
      : <span className={marks?.link ? "exporter-preview-link" : undefined} key={index} style={style}>{run.text}</span>;
  });
}

function FragmentMarker({ marker }: { marker?: string }) {
  return marker ? <span aria-hidden="true" className="exporter-preview-marker">{marker}</span> : null;
}

function TextFragment({ fragment, theme }: { fragment: PreviewTextFragment; theme: PdfTheme }) {
  const className = [
    "exporter-preview-fragment",
    `exporter-preview-${fragment.kind}`,
    fragment.quoteDepth ? "exporter-preview-quote" : "",
  ].filter(Boolean).join(" ");
  return (
    <div
      className={className}
      style={{
        fontSize: fragment.size,
        height: fragment.height,
        lineHeight: `${fragment.lineHeight}px`,
        marginBottom: fragment.spacingAfter,
        marginInlineStart: fragment.indent,
        paddingBottom: fragment.paddingBottom,
        paddingInlineEnd: fragment.paddingInline,
        paddingInlineStart: fragment.paddingInline + (fragment.quoteDepth ? 8 : 0),
        paddingTop: fragment.paddingTop,
      }}
    >
      <FragmentMarker marker={fragment.marker} />
      <TextRuns
        fallbackColor={fragment.kind === "heading" || fragment.kind === "title" ? theme.colors.heading : theme.colors.text}
        runs={fragment.runs}
        theme={theme}
      />
    </div>
  );
}

function PreviewFragmentView({ fragment, theme }: { fragment: PreviewFragment; theme: PdfTheme }) {
  if (fragment.type === "text") return <TextFragment fragment={fragment} theme={theme} />;
  if (fragment.type === "image") {
    return (
      <div
        className={fragment.quoteDepth ? "exporter-preview-fragment exporter-preview-quote" : "exporter-preview-fragment"}
        style={{
          height: fragment.height,
          marginBottom: fragment.spacingAfter,
          marginInlineStart: fragment.indent,
          paddingInlineStart: fragment.quoteDepth ? 8 : undefined,
        }}
      >
        <FragmentMarker marker={fragment.marker} />
        <img alt={fragment.alt} height={fragment.height} src={fragment.source} width={fragment.width} />
      </div>
    );
  }
  if (fragment.type === "divider") {
    return (
      <div
        aria-hidden="true"
        className="exporter-preview-divider"
        style={{
          borderTopColor: theme.colors.tableBorder,
          borderTopStyle: fragment.style,
          height: fragment.height,
          marginInlineStart: fragment.indent,
        }}
      >
        <FragmentMarker marker={fragment.marker} />
      </div>
    );
  }
  return (
    <div
      className={fragment.quoteDepth ? "exporter-preview-table-row exporter-preview-quote" : "exporter-preview-table-row"}
      style={{
        gridTemplateColumns: `repeat(${fragment.cells.length}, minmax(0, 1fr))`,
        height: fragment.height,
        marginBottom: fragment.spacingAfter,
        marginInlineStart: fragment.indent,
      }}
    >
      <FragmentMarker marker={fragment.marker} />
      {fragment.cells.map((lines, index) => (
        <div className="exporter-preview-table-cell" key={index} style={{ borderColor: theme.colors.tableBorder }}>
          {lines.map((line, lineIndex) => <div key={lineIndex} style={{ lineHeight: `${fragment.lineHeight}px` }}>{line || "\u00a0"}</div>)}
        </div>
      ))}
    </div>
  );
}

function PreviewPageView({
  availableWidth,
  index,
  page,
  theme,
  total,
}: {
  availableWidth: number;
  index: number;
  page: PreviewPage;
  theme: PdfTheme;
  total: number;
}) {
  const scale = availableWidth > PAGE_HORIZONTAL_GUTTER
    ? Math.min(PAGE_SCALE_LIMIT, (availableWidth - PAGE_HORIZONTAL_GUTTER) / page.width)
    : 1;
  return (
    <div
      className="exporter-preview-page-container"
      data-page-number={index + 1}
      style={{ height: page.height * scale, width: page.width * scale }}
    >
      <article
        aria-label={`Page ${index + 1} of ${total}`}
        className="exporter-preview-page"
        style={{
          "--exporter-preview-code-background": theme.colors.codeBackground,
          "--exporter-preview-heading": readableTextColor(undefined, theme.colors.heading),
          "--exporter-preview-link": readableTextColor(undefined, theme.colors.link),
          "--exporter-preview-list-indent": `${theme.spacing.listIndent}px`,
          "--exporter-preview-table-border": theme.colors.tableBorder,
          "--exporter-preview-table-font-size": `${Math.max(6, theme.fontSize.body - 1)}px`,
          color: readableTextColor(undefined, theme.colors.text),
          height: page.height,
          padding: `${page.marginTop}px ${page.marginRight}px ${page.marginBottom}px ${page.marginLeft}px`,
          transform: `scale(${scale})`,
          width: page.width,
        } as CSSProperties}
      >
        {page.fragments.map((fragment, fragmentIndex) => (
          <PreviewFragmentView fragment={fragment} key={fragmentIndex} theme={theme} />
        ))}
        {theme.pageNumbers ? (
          <span className="exporter-preview-page-number" style={{ bottom: Math.max(14, page.marginBottom * 0.45) }}>
            {index + 1} / {total}
          </span>
        ) : null}
      </article>
    </div>
  );
}

function LazyPreviewPage(props: Parameters<typeof PreviewPageView>[0]) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(props.index === 0 || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (visible || !host.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(({ isIntersecting }) => isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: PAGE_PRELOAD_MARGIN });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);
  const scale = props.availableWidth > PAGE_HORIZONTAL_GUTTER
    ? Math.min(PAGE_SCALE_LIMIT, (props.availableWidth - PAGE_HORIZONTAL_GUTTER) / props.page.width)
    : 1;
  return (
    <div
      className="exporter-preview-page-slot"
      ref={host}
      style={{ height: props.page.height * scale, width: props.page.width * scale }}
    >
      {visible ? <PreviewPageView {...props} /> : null}
    </div>
  );
}

export function DocumentPreview({
  documents,
  onError,
  onReady,
  theme,
}: {
  documents: readonly ExportDocumentV1[];
  onError: (reason: unknown) => void;
  onReady: () => void;
  theme: PdfTheme;
}) {
  const container = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [metadata, setMetadata] = useState<ReadonlyMap<string, PreviewImageMetadata | null>>(new Map());
  onErrorRef.current = onError;
  onReadyRef.current = onReady;

  const sources = useMemo(() => imageSources(documents), [documents]);
  useEffect(() => {
    if (sources.length === 0) {
      setMetadata((current) => current.size === 0 ? current : new Map());
      return;
    }
    let cancelled = false;
    void Promise.all(sources.map(async (source) => [source, await loadImageMetadata(source)] as const))
      .then((entries) => {
        if (!cancelled) setMetadata(new Map(entries));
      });
    return () => {
      cancelled = true;
    };
  }, [sources]);

  useLayoutEffect(() => {
    const node = container.current;
    if (!node) return;
    const update = (width: number) => setAvailableWidth(width);
    update(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => update(entries[0]?.contentRect.width ?? node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const layoutKey = previewLayoutKey(theme);
  const result = useMemo(() => {
    const start = performance.now();
    try {
      const pages = paginatePreview(documents, theme, browserTextMeasurer, metadata);
      devMeasure("exporter:preview-pagination", start);
      return { pages };
    } catch (error) {
      return { error, pages: [] as PreviewPage[] };
    }
  }, [documents, layoutKey, metadata]);

  useEffect(() => {
    if (result.error) {
      onErrorRef.current(result.error);
      return;
    }
    const start = performance.now();
    const frame = requestAnimationFrame(() => {
      devMeasure("exporter:preview-first-page-paint", start);
      onReadyRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [result]);

  return (
    <div
      aria-label={`Document preview, ${result.pages.length} ${result.pages.length === 1 ? "page" : "pages"}`}
      className="exporter-preview-pages"
      ref={container}
      role="document"
    >
      {result.pages.map((page, index) => (
        <LazyPreviewPage
          availableWidth={availableWidth}
          index={index}
          key={`${index}-${page.width}-${page.height}`}
          page={page}
          theme={theme}
          total={result.pages.length}
        />
      ))}
    </div>
  );
}
