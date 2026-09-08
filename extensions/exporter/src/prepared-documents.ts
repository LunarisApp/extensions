import type {
  PluginResourceData,
  PluginResourceReadContext,
} from "@lunarisapp/plugin-sdk";
import {
  assertExportDocumentV1,
  type ExportDocumentV1,
  type ExportResourceSnapshot,
} from "./contract";

export interface FingerprintResource {
  name?: string | null;
  resourceId: string;
  schemaVersion: number;
  updatedAt?: string | null;
}

export interface RepresentationInvoker {
  id: string;
  invoke(snapshot: ExportResourceSnapshot): Promise<unknown> | unknown;
}

export interface PreparedDocumentRequest {
  fingerprint: string | null;
  representation: RepresentationInvoker;
  resourceId: string;
  resourceName: string;
  selectionFingerprint: string;
}

export interface PreparedDocument {
  document: ExportDocumentV1;
  failed: boolean;
  fingerprint: string | null;
  resourceId: string;
}

export interface PreparedDocumentCacheEntry {
  document: ExportDocumentV1;
  fingerprint: string;
}

export type PreparedDocumentCache = Map<string, PreparedDocumentCacheEntry>;

export class LatestRequestGate {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(request: number): boolean {
    return request === this.generation;
  }
}

function childResources(
  resourceId: string,
  children: ReadonlyMap<string | null, readonly FingerprintResource[]>,
): readonly FingerprintResource[] {
  return children.get(resourceId) ?? [];
}

function fingerprintResourceTree(
  resourceId: string,
  resources: ReadonlyMap<string, FingerprintResource>,
  children: ReadonlyMap<string | null, readonly FingerprintResource[]>,
  contributorId: string,
  requireUpdatedAt: boolean,
): string | null {
  const visiting = new Set<string>();
  const fingerprint = (id: string): unknown[] | null => {
    const resource = resources.get(id);
    if (!resource || visiting.has(id) || (requireUpdatedAt && !resource.updatedAt)) return null;
    visiting.add(id);
    const descendants: unknown[][] = [];
    for (const child of childResources(id, children)) {
      const value = fingerprint(child.resourceId);
      if (!value) return null;
      descendants.push(value);
    }
    visiting.delete(id);
    return [
      resource.resourceId,
      resource.schemaVersion,
      resource.name ?? "",
      resource.updatedAt ?? null,
      descendants,
    ];
  };
  const value = fingerprint(resourceId);
  return value ? JSON.stringify([contributorId, value]) : null;
}

/** A stable subtree token. Null deliberately disables caching for incomplete metadata. */
export function resourceFingerprint(
  resourceId: string,
  resources: ReadonlyMap<string, FingerprintResource>,
  children: ReadonlyMap<string | null, readonly FingerprintResource[]>,
  contributorId: string,
): string | null {
  return fingerprintResourceTree(resourceId, resources, children, contributorId, true);
}

/** Tracks selection/source metadata even when missing timestamps make the result non-cacheable. */
export function resourceSelectionFingerprint(
  resourceId: string,
  resources: ReadonlyMap<string, FingerprintResource>,
  children: ReadonlyMap<string | null, readonly FingerprintResource[]>,
  contributorId: string,
): string {
  return fingerprintResourceTree(resourceId, resources, children, contributorId, false) ??
    JSON.stringify([contributorId, resourceId, "invalid"]);
}

export function preparedRequestKey(requests: readonly PreparedDocumentRequest[]): string {
  return JSON.stringify(requests.map(({ fingerprint, representation, resourceId, selectionFingerprint }) => [
    resourceId,
    representation.id,
    fingerprint,
    selectionFingerprint,
  ]));
}

export async function snapshotResource(
  context: PluginResourceReadContext,
  resourceId: string,
): Promise<ExportResourceSnapshot> {
  const resolution = await context.resolveResource(resourceId);
  if (resolution.status !== "ready") throw new Error(resolution.diagnostic);
  const resource = await context.getWorkspaceResource(resourceId);
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
  const descendants = await context.getWorkspaceResourceChildren(resourceId);
  return {
    children: await Promise.all(
      descendants.map((child: PluginResourceData) => snapshotResource(context, child.resourceId)),
    ),
    resource,
    yjsUpdates,
  };
}

export async function mapConcurrent<T, U>(
  values: readonly T[],
  limit: number,
  transform: (value: T, index: number) => Promise<U>,
): Promise<U[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Concurrency limit must be positive");
  const results = new Array<U>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await transform(values[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function failureDocument(name: string): ExportDocumentV1 {
  return {
    blocks: [{ children: [{ text: "This source could not be read." }], type: "paragraph" }],
    title: name || "Untitled",
    version: 1,
  };
}

export async function loadPreparedDocuments(
  requests: readonly PreparedDocumentRequest[],
  context: PluginResourceReadContext,
  cache: PreparedDocumentCache,
  concurrency = 4,
  isCurrent: () => boolean = () => true,
): Promise<PreparedDocument[]> {
  const selected = new Set(requests.map(({ resourceId }) => resourceId));
  for (const resourceId of cache.keys()) {
    if (!selected.has(resourceId)) cache.delete(resourceId);
  }

  return mapConcurrent(requests, concurrency, async (request) => {
    const cached = request.fingerprint ? cache.get(request.resourceId) : undefined;
    if (cached?.fingerprint === request.fingerprint) {
      return {
        document: cached.document,
        failed: false,
        fingerprint: request.fingerprint,
        resourceId: request.resourceId,
      };
    }
    try {
      const document = await request.representation.invoke(
        await snapshotResource(context, request.resourceId),
      );
      assertExportDocumentV1(document);
      if (request.fingerprint && isCurrent()) {
        cache.set(request.resourceId, { document, fingerprint: request.fingerprint });
      } else if (isCurrent()) {
        cache.delete(request.resourceId);
      }
      return {
        document,
        failed: false,
        fingerprint: request.fingerprint,
        resourceId: request.resourceId,
      };
    } catch {
      if (isCurrent()) cache.delete(request.resourceId);
      return {
        document: failureDocument(request.resourceName),
        failed: true,
        fingerprint: request.fingerprint,
        resourceId: request.resourceId,
      };
    }
  });
}
