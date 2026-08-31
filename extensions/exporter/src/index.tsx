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
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

function ActionIcon({ name }: { name: "down" | "open" | "remove" | "up" }) {
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
  const path = name === "up" ? "m6 11 4-4 4 4" : "m6 9 4 4 4-4";
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d={path} /></svg>;
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" className="exporter-folder-icon" viewBox="0 0 20 20">
      <path d="M2.75 6.75c0-.97.78-1.75 1.75-1.75h3l1.5 2h6.5c.97 0 1.75.78 1.75 1.75v5.5c0 .97-.78 1.75-1.75 1.75h-11c-.97 0-1.75-.78-1.75-1.75v-7.5Z" />
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

  const exportPdf = async () => {
    if (loading || working || selectedIds.length === 0) return;
    setWorking(true);
    setError(undefined);
    setNotice(undefined);
    let failedCount = 0;
    try {
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
      const data = await renderPdf(documents, theme);
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

  return (
    <main className="exporter-root">
      <header className="exporter-header">
        <div>
          <h1>Export PDF</h1>
          <p className="exporter-muted">Build one PDF from project documents.</p>
        </div>
        {!canWriteContent ? <span className="exporter-badge">Read only</span> : null}
      </header>

      <section aria-labelledby="exporter-sources-title" className="exporter-section">
        <div className="exporter-section-header">
          <h2 id="exporter-sources-title">Documents</h2>
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

      <div className="exporter-options">
        {selectedResources.length > 0 ? (
          <details className="exporter-panel">
            <summary className="exporter-panel-summary">
              <span>
                <strong>Document order</strong>
                <small>{selectedResources.length} selected</small>
              </span>
            </summary>
            <ol className="exporter-order-list" role="list">
              {selectedResources.map((resource, index) => (
                <li key={resource.resourceId}>
                  <span aria-hidden="true" className="exporter-order-number">{index + 1}</span>
                  <span className="exporter-item-name">{resource.name || "Untitled"}</span>
                  <div className="exporter-order-actions">
                    <button aria-label={`Open ${resource.name || "Untitled"}`} className="exporter-icon-button" onClick={() => openResource({
                      resourceId: resource.resourceId,
                      resourceTypeId: resource.resourceTypeId,
                      schemaVersion: resource.schemaVersion,
                      title: resource.name || "Untitled",
                    })} title="Open source" type="button"><ActionIcon name="open" /></button>
                    <button aria-label={`Move ${resource.name || "Untitled"} up`} className="exporter-icon-button" disabled={!canEditSettings || index === 0} onClick={() => void saveSelection(moveSelectedId(selectedIds, resource.resourceId, -1))} title="Move up" type="button"><ActionIcon name="up" /></button>
                    <button aria-label={`Move ${resource.name || "Untitled"} down`} className="exporter-icon-button" disabled={!canEditSettings || index === selectedResources.length - 1} onClick={() => void saveSelection(moveSelectedId(selectedIds, resource.resourceId, 1))} title="Move down" type="button"><ActionIcon name="down" /></button>
                    <button aria-label={`Remove ${resource.name || "Untitled"}`} className="exporter-icon-button" disabled={!canEditSettings} onClick={() => void saveSelection(selectedIds.filter((id) => id !== resource.resourceId))} title="Remove" type="button"><ActionIcon name="remove" /></button>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <StyleSettings disabled={!canEditSettings} onChange={(next) => void saveTheme(next)} theme={theme} />
      </div>

      {error ? <p className="exporter-message exporter-error" role="alert">{error}</p> : null}
      {notice ? <p className="exporter-message exporter-success" role="status">{notice}</p> : null}
      <div className="exporter-actions">
        <span className="exporter-muted">{selectedIds.length} {selectedIds.length === 1 ? "document" : "documents"}</span>
        <button aria-busy={working} className="exporter-button" disabled={loading || working || selectedIds.length === 0} onClick={() => void exportPdf()} type="button">
          {working ? "Exporting…" : "Export PDF"}
        </button>
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
      icon: exporterIcon,
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
