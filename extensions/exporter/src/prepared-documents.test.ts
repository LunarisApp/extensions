import { describe, expect, it, vi } from "vitest";
import type { PluginResourceData, PluginResourceReadContext } from "@lunarisapp/plugin-sdk";
import {
  LatestRequestGate,
  loadPreparedDocuments,
  mapConcurrent,
  resourceFingerprint,
  resourceSelectionFingerprint,
  type FingerprintResource,
  type PreparedDocumentCache,
  type PreparedDocumentRequest,
} from "./prepared-documents";

function resource(resourceId: string, updatedAt: string | null = "2026-09-07T00:00:00Z"): PluginResourceData {
  return {
    createdAt: "2026-09-01T00:00:00Z",
    name: resourceId,
    parentId: null,
    position: 0,
    resourceId,
    resourceTypeId: "test.document",
    schemaVersion: 1,
    storage: {},
    updatedAt,
  };
}

function context(values: PluginResourceData[]): PluginResourceReadContext {
  const byId = new Map(values.map((value) => [value.resourceId, value]));
  return {
    getWorkspaceResource: vi.fn(async (id) => byId.get(id) ?? null),
    getWorkspaceResourceChildren: vi.fn(async () => []),
    getYjsStorageUpdates: vi.fn(async () => []),
    resolveResource: vi.fn(async () => ({ status: "ready" as const })),
  };
}

describe("resource fingerprints", () => {
  it("includes ordered descendants and contributor identity", () => {
    const parent = resource("parent");
    const child = { ...resource("child"), name: "First child" };
    const sibling = { ...resource("sibling"), name: "Second child" };
    const resources = new Map<string, FingerprintResource>([["parent", parent], ["child", child], ["sibling", sibling]]);
    const children = new Map<string | null, FingerprintResource[]>([["parent", [child, sibling]]]);

    const first = resourceFingerprint("parent", resources, children, "provider-a");
    child.name = "Renamed";
    const changed = resourceFingerprint("parent", resources, children, "provider-a");

    expect(first).not.toBe(changed);
    expect(resourceFingerprint("parent", resources, children, "provider-b")).not.toBe(changed);
    parent.updatedAt = "2026-09-08T00:00:00Z";
    expect(resourceFingerprint("parent", resources, children, "provider-a")).not.toBe(changed);
    parent.updatedAt = "2026-09-07T00:00:00Z";
    children.set("parent", [sibling, child]);
    expect(resourceFingerprint("parent", resources, children, "provider-a")).not.toBe(changed);
  });

  it("disables caching when any subtree timestamp is missing", () => {
    const parent = resource("parent");
    const child = resource("child", null);
    expect(resourceFingerprint(
      "parent",
      new Map([["parent", parent], ["child", child]]),
      new Map([["parent", [child]]]),
      "provider",
    )).toBeNull();
  });

  it("still tracks structural changes when caching is disabled", () => {
    const parent = resource("parent", null);
    const resources = new Map<string, FingerprintResource>([["parent", parent]]);
    const first = resourceSelectionFingerprint("parent", resources, new Map(), "provider");
    parent.name = "Renamed";

    expect(resourceSelectionFingerprint("parent", resources, new Map(), "provider")).not.toBe(first);
  });
});

describe("prepared document loading", () => {
  it("rejects stale asynchronous request generations", () => {
    const gate = new LatestRequestGate();
    const stale = gate.begin();
    const current = gate.begin();

    expect(gate.isCurrent(stale)).toBe(false);
    expect(gate.isCurrent(current)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(current)).toBe(false);
  });

  it("limits concurrency and preserves request order", async () => {
    let active = 0;
    let maximum = 0;
    const values = await mapConcurrent([30, 5, 20, 1, 10], 2, async (delay, index) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index;
    });

    expect(maximum).toBe(2);
    expect(values).toEqual([0, 1, 2, 3, 4]);
  });

  it("reuses successful cached representations and invalidates changed fingerprints", async () => {
    const invoke = vi.fn(async (snapshot) => ({
      blocks: [],
      title: snapshot.resource.name ?? "Untitled",
      version: 1 as const,
    }));
    const request: PreparedDocumentRequest = {
      fingerprint: "one",
      representation: { id: "provider", invoke },
      resourceId: "one",
      resourceName: "One",
      selectionFingerprint: "one",
    };
    const cache: PreparedDocumentCache = new Map();
    const resourceContext = context([resource("one")]);

    await loadPreparedDocuments([request], resourceContext, cache);
    await loadPreparedDocuments([request], resourceContext, cache);
    await loadPreparedDocuments([{ ...request, fingerprint: "two" }], resourceContext, cache);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("prunes cached resources that are no longer selected", async () => {
    const invoke = vi.fn(async () => ({ blocks: [], title: "One", version: 1 as const }));
    const request: PreparedDocumentRequest = {
      fingerprint: "one",
      representation: { id: "provider", invoke },
      resourceId: "one",
      resourceName: "One",
      selectionFingerprint: "one",
    };
    const cache: PreparedDocumentCache = new Map([
      ["removed", { document: { blocks: [], title: "Removed", version: 1 }, fingerprint: "removed" }],
    ]);

    await loadPreparedDocuments([request], context([resource("one")]), cache);

    expect(cache.has("removed")).toBe(false);
    expect(cache.has("one")).toBe(true);
  });

  it("does not cache null fingerprints or failures", async () => {
    const invoke = vi.fn(async () => {
      throw new Error("unavailable");
    });
    const request: PreparedDocumentRequest = {
      fingerprint: null,
      representation: { id: "provider", invoke },
      resourceId: "one",
      resourceName: "Broken source",
      selectionFingerprint: "one",
    };
    const cache: PreparedDocumentCache = new Map();

    const first = await loadPreparedDocuments([request], context([resource("one", null)]), cache);
    const second = await loadPreparedDocuments([request], context([resource("one", null)]), cache);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
    expect(first[0]).toMatchObject({ failed: true, document: { title: "Broken source" } });
    expect(second[0]?.document.blocks[0]).toMatchObject({ type: "paragraph" });
  });

  it("does not let a stale completion overwrite the current cache", async () => {
    let resolve!: (value: { blocks: []; title: string; version: 1 }) => void;
    const invoke = vi.fn(() => new Promise<{ blocks: []; title: string; version: 1 }>((done) => {
      resolve = done;
    }));
    const request: PreparedDocumentRequest = {
      fingerprint: "stale",
      representation: { id: "provider", invoke },
      resourceId: "one",
      resourceName: "One",
      selectionFingerprint: "one",
    };
    const cache: PreparedDocumentCache = new Map([
      ["one", { document: { blocks: [], title: "Current", version: 1 }, fingerprint: "current" }],
    ]);
    let current = true;

    const loading = loadPreparedDocuments([request], context([resource("one")]), cache, 4, () => current);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    current = false;
    resolve({ blocks: [], title: "Stale", version: 1 });
    await loading;

    expect(cache.get("one")).toMatchObject({ fingerprint: "current", document: { title: "Current" } });
  });
});
