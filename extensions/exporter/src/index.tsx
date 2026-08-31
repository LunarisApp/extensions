import {
  ViewReady,
  definePlugin,
  type JsonValue,
  type PluginResourceReadContext,
  type ResourceStorageHandle,
  type ResourceViewProps,
  useCurrentProject,
  useDownloads,
  useKeyValue,
  usePluginResourceReadContext,
  usePluginServiceSlot,
  useProjectChildrenMap,
  useProjectResourcesMap,
  useWorkspaceAccess,
  useWorkspaceNavigation,
} from "@lunarisapp/plugin-sdk";
import { Pdf02Icon } from "@lunarisapp/ui/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import * as z from "zod";
import manifest from "../manifest.json";
import {
  EXPORTER_EXTENSION_ID,
  assertExportDocumentV1,
  exporterRepresentations,
  exporterService,
  isExporterRepresentationMetadata,
  type ExportDocumentV1,
  type ExportResourceSnapshot,
} from "./contract";
import { exporterIcon } from "./icon";
import { renderPdf } from "./pdf";
import {
  buildExportableItems,
  moveSelectedId,
  normalizeSelectedIds,
  orderedDocumentIds,
  reorderSelectedId,
  toggleSelectedIds,
} from "./selection";
import { StyleSettings } from "./style-settings";
import { mergePdfTheme, type PdfTheme } from "./theme";
import "./styles.css";

async function snapshotResource(
  context: PluginResourceReadContext,
  resourceId: string,
): Promise<ExportResourceSnapshot> {
  const resolution = await context.resolveResource(resourceId);
  if (resolution.status !== "ready") throw new Error(resolution.diagnostic);
  const resource = await context.getProjectResource(resourceId);
  if (!resource) throw new Error("Resource is unavailable");
  const yjsUpdates = Object.fromEntries(
    await Promise.all(
      Object.entries(resource.storage)
        .filter(([, storage]) => storage.kind === "yjs")
        .map(async ([name, storage]) => [
          name,
          (await context.getYjsStorageUpdates(storage)).map(({ updateBase64 }) => updateBase64),
        ] as const),
    ),
  );
  const children = await context.getProjectResourceChildren(resourceId);
  return {
    children: await Promise.all(children.map((child) => snapshotResource(context, child.resourceId))),
    resource,
    yjsUpdates,
  };
}

function safeFilename(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "export";
}

function SelectionCheckbox({
  checked,
  disabled,
  id,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  id: string;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input aria-label={label} checked={checked} disabled={disabled} id={id} onChange={onChange} ref={ref} type="checkbox" />;
}

function ActionIcon({ name }: { name: "open" | "remove" }) {
  if (name === "open") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="M8 5H5.75A1.75 1.75 0 0 0 4 6.75v7.5C4 15.22 4.78 16 5.75 16h7.5A1.75 1.75 0 0 0 15 14.25V12M11 4h5v5M16 4l-7 7" />
      </svg>
    );
  }
  if (name === "remove") {
    return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m6 6 8 8M14 6l-8 8" /></svg>;
  }
}

function DragIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="7" cy="5" r="1" />
      <circle cx="13" cy="5" r="1" />
      <circle cx="7" cy="10" r="1" />
      <circle cx="13" cy="10" r="1" />
      <circle cx="7" cy="15" r="1" />
      <circle cx="13" cy="15" r="1" />
    </svg>
  );
}

type ExporterTab = "appearance" | "documents" | "order";
type PreviewStatus = "empty" | "error" | "loading" | "ready" | "refreshing";

function FolderIcon() {
  return (
    <svg aria-hidden="true" className="exporter-folder-icon" viewBox="0 0 20 20">
      <path d="M2.75 6.75c0-.97.78-1.75 1.75-1.75h3l1.5 2h6.5c.97 0 1.75.78 1.75 1.75v5.5c0 .97-.78 1.75-1.75 1.75h-11c-.97 0-1.75-.78-1.75-1.75v-7.5Z" />
    </svg>
  );
}

function PreviewDocumentIcon() {
  return (
    <svg aria-hidden="true" className="exporter-preview-document-icon" viewBox="0 0 48 48">
      <path d="M12.5 5.5h15l8 8v29h-23z" />
      <path d="M27.5 5.5v8h8M18 23h12M18 29h12M18 35h8" />
    </svg>
  );
}

function ExporterView({ storage }: { storage: ResourceStorageHandle }) {
  const { project } = useCurrentProject();
  const resources = useProjectResourcesMap();
  const children = useProjectChildrenMap();
  const representations = usePluginServiceSlot(exporterRepresentations);
  const resourceContext = usePluginResourceReadContext();
  const downloads = useDownloads();
  const { canWriteContent } = useWorkspaceAccess();
  const { openResource } = useWorkspaceNavigation();
  const selectedStorage = useKeyValue<string[]>(storage, "selected-resource-ids");
  const themeStorage = useKeyValue<PdfTheme>(storage, "pdf-theme");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [activeTab, setActiveTab] = useState<ExporterTab>("documents");
  const [draggedId, setDraggedId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: "after" | "before" }>();
  const [orderAnnouncement, setOrderAnnouncement] = useState("");
  const [previewError, setPreviewError] = useState<string>();
  const [previewFailedCount, setPreviewFailedCount] = useState(0);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const previewRequestRef = useRef(0);
  const previewUrlRef = useRef<string | undefined>(undefined);

  const byType = useMemo(
    () => new Map(representations.flatMap((entry) =>
      isExporterRepresentationMetadata(entry.metadata)
        ? entry.metadata.resourceTypeIds.map((id) => [id, entry] as const)
        : []
    )),
    [representations],
  );
  const labelsByType = useMemo(
    () => new Map([...byType].map(([id, entry]) => [id, entry.metadata.label])),
    [byType],
  );
  const items = useMemo(
    () => buildExportableItems(resources, children, labelsByType),
    [children, labelsByType, resources],
  );
  const defaultOrder = useMemo(() => orderedDocumentIds(items), [items]);
  const validIds = useMemo(() => new Set(defaultOrder), [defaultOrder]);
  const selectedIds = useMemo(
    () => normalizeSelectedIds(selectedStorage.value, validIds),
    [selectedStorage.value, validIds],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedResources = selectedIds.flatMap((id) => {
    const resource = resources.get(id);
    return resource ? [resource] : [];
  });
  const theme = useMemo(() => mergePdfTheme(themeStorage.value), [themeStorage.value]);
  const loading = selectedStorage.isLoading || themeStorage.isLoading;
  const canEditSettings = canWriteContent && !loading && !working;

  const saveSelection = async (next: string[]) => {
    if (!canEditSettings) return;
    setError(undefined);
    setNotice(undefined);
    try {
      await selectedStorage.set(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save selection. Try again.");
    }
  };

  const saveTheme = async (next: PdfTheme) => {
    if (!canEditSettings) return;
    setError(undefined);
    setNotice(undefined);
    try {
      await themeStorage.set(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save appearance settings. Try again.");
    }
  };

  const buildPdf = useCallback(async () => {
    let failedCount = 0;
    const documents: ExportDocumentV1[] = [];
    for (const resourceId of selectedIds) {
      const resource = resources.get(resourceId);
      const representation = resource ? byType.get(resource.resourceTypeId) : undefined;
      if (!resource || !representation) continue;
      try {
        const document = await representation.invoke(
          await snapshotResource(resourceContext, resourceId),
        );
        assertExportDocumentV1(document);
        documents.push(document);
      } catch {
        failedCount += 1;
        documents.push({
          blocks: [{ children: [{ text: "This source could not be read." }], type: "paragraph" }],
          title: resource.name || "Untitled",
          version: 1,
        });
      }
    }
    return { data: await renderPdf(documents, theme), failedCount };
  }, [byType, resourceContext, resources, selectedIds, theme]);

  useEffect(() => {
    const request = ++previewRequestRef.current;
    if (loading) {
      setPreviewStatus(previewUrlRef.current ? "refreshing" : "loading");
      return;
    }
    if (selectedIds.length === 0) {
      const previousUrl = previewUrlRef.current;
      previewUrlRef.current = undefined;
      setPreviewUrl(undefined);
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      setPreviewError(undefined);
      setPreviewFailedCount(0);
      setPreviewStatus("empty");
      return;
    }

    setPreviewStatus(previewUrlRef.current ? "refreshing" : "loading");
    setPreviewError(undefined);
    const timer = window.setTimeout(() => {
      void buildPdf().then(({ data, failedCount }) => {
        if (request !== previewRequestRef.current) return;
        const nextUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
        const previousUrl = previewUrlRef.current;
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        setPreviewFailedCount(failedCount);
        setPreviewStatus("ready");
      }).catch((reason) => {
        if (request !== previewRequestRef.current) return;
        setPreviewError(reason instanceof Error ? reason.message : "The PDF preview could not be rendered.");
        setPreviewStatus("error");
      });
    }, 320);

    return () => window.clearTimeout(timer);
  }, [buildPdf, loading, previewRetry, selectedIds.length]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const exportPdf = async () => {
    if (loading || working || selectedIds.length === 0) return;
    setWorking(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const { data, failedCount } = await buildPdf();
      await downloads.save({
        data,
        mimeType: "application/pdf",
        suggestedName: `${safeFilename(project?.name ?? "export")}.pdf`,
      });
      setNotice(failedCount > 0
        ? `PDF saved. ${failedCount} ${failedCount === 1 ? "document was" : "documents were"} replaced with an error notice.`
        : "PDF saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed. Try again.");
    } finally {
      setWorking(false);
    }
  };

  const allSelected = defaultOrder.length > 0 && defaultOrder.every((id) => selectedSet.has(id));

  const tabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const tabs = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? [])];
    const current = tabs.indexOf(event.currentTarget);
    const keyTarget = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : event.key === "ArrowLeft"
          ? (current - 1 + tabs.length) % tabs.length
          : event.key === "ArrowRight"
            ? (current + 1) % tabs.length
            : -1;
    if (keyTarget < 0) return;
    event.preventDefault();
    tabs[keyTarget]?.focus();
    tabs[keyTarget]?.click();
  };

  const moveByKeyboard = (resourceId: string, offset: -1 | 1) => {
    const next = moveSelectedId(selectedIds, resourceId, offset);
    if (next === selectedIds) return;
    const resource = resources.get(resourceId);
    const position = next.indexOf(resourceId) + 1;
    void saveSelection(next);
    setOrderAnnouncement(`${resource?.name || "Untitled"} moved to position ${position} of ${next.length}.`);
  };

  const dragOver = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropTarget({
      id: targetId,
      placement: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    });
  };

  const drop = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    if (!draggedId) return;
    const placement = dropTarget?.id === targetId ? dropTarget.placement : "before";
    const next = reorderSelectedId(selectedIds, draggedId, targetId, placement);
    const resource = resources.get(draggedId);
    if (next !== selectedIds) {
      void saveSelection(next);
      setOrderAnnouncement(`${resource?.name || "Untitled"} moved to position ${next.indexOf(draggedId) + 1} of ${next.length}.`);
    }
    setDraggedId(undefined);
    setDropTarget(undefined);
  };

  const tabs: Array<{ id: ExporterTab; label: string }> = [
    { id: "documents", label: "Documents" },
    { id: "order", label: "Order" },
    { id: "appearance", label: "Appearance" },
  ];

  return (
    <main className="exporter-root">
      <header className="exporter-header">
        <div>
          <h1>Export PDF</h1>
          <p className="exporter-muted">Build one PDF from project documents.</p>
        </div>
        {!canWriteContent ? <span className="exporter-badge">Read only</span> : null}
      </header>
      <div className="exporter-layout">
        <section aria-label="PDF preview" className="exporter-preview-pane">
          <div aria-busy={previewStatus === "loading" || previewStatus === "refreshing"} className="exporter-preview-stage">
            {previewUrl ? (
              <iframe
                className="exporter-preview-frame"
                src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                title="PDF preview"
              />
            ) : null}
            {previewStatus === "loading" ? (
              <div className="exporter-preview-state" role="status">
                <span aria-hidden="true" className="exporter-spinner" />
                <strong>Rendering preview</strong>
                <span>Preparing the selected documents.</span>
              </div>
            ) : null}
            {previewStatus === "empty" ? (
              <div className="exporter-preview-state">
                <PreviewDocumentIcon />
                <strong>Your PDF will appear here</strong>
                <span>Choose one or more documents in the sidebar to begin.</span>
              </div>
            ) : null}
            {previewStatus === "error" ? (
              <div className={previewUrl ? "exporter-preview-alert" : "exporter-preview-state"} role="alert">
                <strong>Preview unavailable</strong>
                <span>{previewError}</span>
                <button className="exporter-text-button" onClick={() => setPreviewRetry((value) => value + 1)} type="button">Try again</button>
              </div>
            ) : null}
          </div>
          {previewFailedCount > 0 && previewStatus === "ready" ? (
            <p className="exporter-preview-warning" role="status">
              {previewFailedCount} {previewFailedCount === 1 ? "document could" : "documents could"} not be read and {previewFailedCount === 1 ? "is" : "are"} shown as an error notice.
            </p>
          ) : null}
        </section>

        <aside aria-label="PDF settings" className="exporter-inspector">
          <nav aria-label="Exporter settings" className="exporter-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                aria-controls={`exporter-panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                className="exporter-tab"
                id={`exporter-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={tabKeyDown}
                role="tab"
                tabIndex={activeTab === tab.id ? 0 : -1}
                type="button"
              >
                {tab.label}
                {tab.id === "order" ? <span className="exporter-tab-count">{selectedIds.length}</span> : null}
              </button>
            ))}
          </nav>

          <div className="exporter-workspace">
            <section aria-labelledby="exporter-tab-documents" className="exporter-tab-panel" hidden={activeTab !== "documents"} id="exporter-panel-documents" role="tabpanel">
          <div className="exporter-panel-intro">
            <div>
              <h2>Choose documents</h2>
              <p className="exporter-muted">Select the project content to include in the PDF.</p>
            </div>
            <div className="exporter-inline-actions">
              <button className="exporter-text-button" disabled={!canEditSettings || allSelected} onClick={() => void saveSelection(defaultOrder)} type="button">Select all</button>
              <button className="exporter-text-button" disabled={!canEditSettings || selectedIds.length === 0} onClick={() => void saveSelection([])} type="button">Clear</button>
            </div>
          </div>
          <div aria-busy={loading} className="exporter-list">
            {loading ? <p className="exporter-item exporter-muted">Loading settings…</p> : items.length ? items.map((item) => {
              if (item.type === "folder") {
                const selectedCount = item.documentIds.filter((id) => selectedSet.has(id)).length;
                const checkboxId = `exporter-folder-${item.id}`;
                return (
                  <label className="exporter-item exporter-folder" htmlFor={checkboxId} key={item.id} style={{ "--exporter-depth": item.depth } as CSSProperties}>
                    <SelectionCheckbox
                      checked={selectedCount === item.documentIds.length}
                      disabled={!canEditSettings}
                      indeterminate={selectedCount > 0 && selectedCount < item.documentIds.length}
                      id={checkboxId}
                      label={`Include folder ${item.name || "Untitled folder"}`}
                      onChange={() => void saveSelection(toggleSelectedIds(selectedIds, item.documentIds, defaultOrder))}
                    />
                    <FolderIcon />
                    <strong className="exporter-item-name">{item.name || "Untitled folder"}</strong>
                    <small>{item.documentIds.length} {item.documentIds.length === 1 ? "document" : "documents"}</small>
                  </label>
                );
              }
              const resourceId = item.resource.resourceId;
              const checkboxId = `exporter-document-${resourceId}`;
              return (
                <label className="exporter-item" htmlFor={checkboxId} key={resourceId} style={{ "--exporter-depth": item.depth } as CSSProperties}>
                  <SelectionCheckbox
                    checked={selectedSet.has(resourceId)}
                    disabled={!canEditSettings}
                    id={checkboxId}
                    label={`Include ${item.resource.name || "Untitled"}`}
                    onChange={() => void saveSelection(toggleSelectedIds(selectedIds, [resourceId], defaultOrder))}
                  />
                  <span className="exporter-item-name">{item.resource.name || "Untitled"}</span>
                  <small>{item.label}</small>
                </label>
              );
            }) : <p className="exporter-item exporter-muted">No installed extension contributes exportable content.</p>}
          </div>
            </section>

            <section aria-labelledby="exporter-tab-order" className="exporter-tab-panel" hidden={activeTab !== "order"} id="exporter-panel-order" role="tabpanel">
          <div className="exporter-panel-intro">
            <div>
              <h2>Arrange document order</h2>
              <p className="exporter-muted" id="exporter-order-help">Drag each handle to reorder. With a handle focused, use the up and down arrow keys.</p>
            </div>
          </div>
          {selectedResources.length > 0 ? (
            <ol aria-describedby="exporter-order-help" className="exporter-order-list">
              {selectedResources.map((resource, index) => {
                const isDropTarget = dropTarget?.id === resource.resourceId;
                const rowClassName = [
                  draggedId === resource.resourceId ? "is-dragging" : "",
                  isDropTarget ? `is-drop-${dropTarget.placement}` : "",
                ].filter(Boolean).join(" ");
                return (
                  <li
                    className={rowClassName}
                    key={resource.resourceId}
                    onDragOver={(event) => dragOver(event, resource.resourceId)}
                    onDrop={(event) => drop(event, resource.resourceId)}
                  >
                    <span
                      aria-label={`Reorder ${resource.name || "Untitled"}, position ${index + 1} of ${selectedResources.length}`}
                      className="exporter-drag-handle"
                      draggable={canEditSettings}
                      onDragEnd={() => {
                        setDraggedId(undefined);
                        setDropTarget(undefined);
                      }}
                      onDragStart={(event) => {
                        setDraggedId(resource.resourceId);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", resource.resourceId);
                      }}
                      onKeyDown={(event) => {
                        if (!canEditSettings || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                        event.preventDefault();
                        moveByKeyboard(resource.resourceId, event.key === "ArrowUp" ? -1 : 1);
                      }}
                      role="button"
                      tabIndex={canEditSettings ? 0 : -1}
                    >
                      <DragIcon />
                    </span>
                    <span aria-hidden="true" className="exporter-order-number">{index + 1}</span>
                    <span className="exporter-item-name">{resource.name || "Untitled"}</span>
                    <div className="exporter-order-actions">
                      <button aria-label={`Open ${resource.name || "Untitled"}`} className="exporter-icon-button" onClick={() => openResource({
                        resourceId: resource.resourceId,
                        resourceTypeId: resource.resourceTypeId,
                        schemaVersion: resource.schemaVersion,
                        title: resource.name || "Untitled",
                      })} title="Open source" type="button"><ActionIcon name="open" /></button>
                      <button aria-label={`Remove ${resource.name || "Untitled"}`} className="exporter-icon-button" disabled={!canEditSettings} onClick={() => void saveSelection(selectedIds.filter((id) => id !== resource.resourceId))} title="Remove" type="button"><ActionIcon name="remove" /></button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="exporter-empty">
              <h3>No documents selected</h3>
              <p className="exporter-muted">Choose documents first, then return here to arrange them.</p>
              <button className="exporter-text-button" onClick={() => setActiveTab("documents")} type="button">Choose documents</button>
            </div>
          )}
          <p aria-live="polite" className="exporter-visually-hidden">{orderAnnouncement}</p>
            </section>

            <section aria-labelledby="exporter-tab-appearance" className="exporter-tab-panel" hidden={activeTab !== "appearance"} id="exporter-panel-appearance" role="tabpanel">
          <div className="exporter-panel-intro">
            <div>
              <h2>Style the PDF</h2>
              <p className="exporter-muted">Set page, typography, spacing, and color options.</p>
            </div>
          </div>
          <StyleSettings disabled={!canEditSettings} onChange={(next) => void saveTheme(next)} theme={theme} />
            </section>
          </div>

          {error ? <p className="exporter-message exporter-error" role="alert">{error}</p> : null}
          {notice ? <p className="exporter-message exporter-success" role="status">{notice}</p> : null}
          <div className="exporter-actions">
            <span className="exporter-muted">{selectedIds.length} {selectedIds.length === 1 ? "document" : "documents"}</span>
            <button aria-busy={working} className="exporter-button" disabled={loading || working || selectedIds.length === 0} onClick={() => void exportPdf()} type="button">
              {working ? "Exporting…" : "Export PDF"}
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default definePlugin({
  manifest,
  activate({ contributions, services }) {
    services.provide(exporterService, {});
    contributions.resourceType({
      defaultViewId: EXPORTER_EXTENSION_ID,
      hierarchy: { userCreatable: true, visible: true },
      icon: Pdf02Icon,
      name: "Exporter",
      resourceTypeId: EXPORTER_EXTENSION_ID,
      schema: {
        currentVersion: 1,
        id: "lunaris.exporter.selection",
        read: ({ storage }) => storage.state?.kind === "key-value" ? storage.state.values : {},
        versions: { 1: z.record(z.string(), z.unknown()) },
        write: (payload, { storage }) => {
          if (storage.state?.kind !== "key-value") throw new Error("Exporter state is unavailable");
          storage.state.values = z.record(z.string(), z.unknown()).parse(payload) as Record<string, JsonValue>;
        },
      },
      storage: { state: { kind: "key-value" } },
    });
    contributions.view({
      icon: exporterIcon,
      name: "Exporter",
      renderer: ({ reportReady, storage }: ResourceViewProps) => {
        if (!storage.state) throw new Error("Exporter state is unavailable");
        return (
          <ViewReady reportReady={reportReady}>
            <ExporterView storage={storage.state} />
          </ViewReady>
        );
      },
      storageRequirements: { state: "key-value" },
      target: { kind: "resource", resourceTypeIds: [EXPORTER_EXTENSION_ID] },
      viewId: EXPORTER_EXTENSION_ID,
    });
    contributions.locales({ en: { extensions: { catalog: { "lunaris.exporter": { title: "Exporter" } } } } });
  },
});
