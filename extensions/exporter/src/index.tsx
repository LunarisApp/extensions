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
  useProjectResourcesMap,
} from "@lunarisapp/plugin-sdk";
import { useMemo, useState } from "react";
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

function ExporterView({ storage }: { storage: ResourceStorageHandle }) {
  const { project } = useCurrentProject();
  const resources = useProjectResourcesMap();
  const representations = usePluginServiceSlot(exporterRepresentations);
  const resourceContext = usePluginResourceReadContext();
  const downloads = useDownloads();
  const selected = useKeyValue<string[]>(storage, "selected-resource-ids");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const byType = useMemo(
    () => new Map(representations.flatMap((entry) =>
      isExporterRepresentationMetadata(entry.metadata)
        ? entry.metadata.resourceTypeIds.map((id) => [id, entry] as const)
        : []
    )),
    [representations],
  );
  const candidates = useMemo(
    () => [...resources.values()].filter((resource) => byType.has(resource.resourceTypeId)),
    [byType, resources],
  );
  const selectedIds = new Set(selected.value ?? []);

  const toggle = async (resourceId: string) => {
    const next = new Set(selectedIds);
    if (next.has(resourceId)) next.delete(resourceId);
    else next.add(resourceId);
    await selected.set([...next]);
  };

  const exportPdf = async () => {
    if (working || selectedIds.size === 0) return;
    setWorking(true);
    setError(undefined);
    try {
      const documents: ExportDocumentV1[] = [];
      for (const resourceId of selectedIds) {
        const resource = resources.get(resourceId);
        const representation = resource ? byType.get(resource.resourceTypeId) : undefined;
        if (!representation) continue;
        const document = await representation.invoke(
          await snapshotResource(resourceContext, resourceId),
        );
        assertExportDocumentV1(document);
        documents.push(document);
      }
      const data = await renderPdf(documents);
      await downloads.save({
        data,
        mimeType: "application/pdf",
        suggestedName: `${safeFilename(project?.name ?? "export")}.pdf`,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="exporter-root">
      <header className="exporter-header">
        <h1>Exporter</h1>
      </header>
      <p className="exporter-muted">Select project content to include in a PDF.</p>
      <section aria-label="Exportable content" className="exporter-list">
        {candidates.length ? candidates.map((resource) => (
          <label className="exporter-item" key={resource.resourceId}>
            <input
              checked={selectedIds.has(resource.resourceId)}
              onChange={() => void toggle(resource.resourceId)}
              type="checkbox"
            />
            <span>{resource.name || "Untitled"}</span>
          </label>
        )) : <p className="exporter-item exporter-muted">No installed extension contributes exportable content.</p>}
      </section>
      {error ? <p className="exporter-error" role="alert">{error}</p> : null}
      <div className="exporter-actions">
        <button className="exporter-button" disabled={working || selectedIds.size === 0} onClick={() => void exportPdf()} type="button">
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
      renderer: ({ reportReady, storage }: ResourceViewProps) => (
        <ViewReady reportReady={reportReady}>
          <ExporterView storage={storage.state!} />
        </ViewReady>
      ),
      storageRequirements: { state: "key-value" },
      target: { kind: "resource", resourceTypeIds: [EXPORTER_EXTENSION_ID] },
      viewId: EXPORTER_EXTENSION_ID,
    });
    contributions.locales({ en: { extensions: { catalog: { "lunaris.exporter": { title: "Exporter" } } } } });
  },
});
