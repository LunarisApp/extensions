import type {
  PluginResource,
  PluginResourceChildrenMap,
  PluginResourcesMap,
} from "@lunarisapp/plugin-sdk";
import { describe, expect, it } from "vitest";
import {
  buildExportableItems,
  moveSelectedId,
  normalizeSelectedIds,
  orderedDocumentIds,
  toggleSelectedIds,
} from "./selection";

function resource(id: string, resourceTypeId: string, parentId: string | null): PluginResource {
  return {
    name: id,
    parentId,
    resourceId: id,
    resourceTypeId,
    schemaVersion: 1,
    storage: {},
  };
}

function tree(values: PluginResource[]): {
  children: PluginResourceChildrenMap;
  resources: PluginResourcesMap;
} {
  const resources: PluginResourcesMap = new Map(values.map((value) => [value.resourceId, value]));
  const children: PluginResourceChildrenMap = new Map();
  for (const value of values) {
    const bucket = children.get(value.parentId) ?? [];
    bucket.push(value);
    children.set(value.parentId, bucket);
  }
  return { children, resources };
}

describe("exporter selection", () => {
  it("preserves hierarchy order and includes folders containing supported documents", () => {
    const { children, resources } = tree([
      resource("folder", "lunaris.folder", "__root__"),
      resource("first", "lunaris.rich-text", "folder"),
      resource("ignored", "lunaris.unknown", "folder"),
      resource("nested", "lunaris.folder", "folder"),
      resource("second", "lunaris.kanban", "nested"),
      resource("last", "lunaris.rich-text", "__root__"),
    ]);
    const items = buildExportableItems(
      resources,
      children,
      new Map([["lunaris.rich-text", "Rich Text"], ["lunaris.kanban", "Kanban"]]),
    );

    expect(items.map((item) => item.type === "folder" ? item.id : item.resource.resourceId)).toEqual([
      "folder",
      "first",
      "nested",
      "second",
      "last",
    ]);
    expect(orderedDocumentIds(items)).toEqual(["first", "second", "last"]);
    expect(items[0]).toMatchObject({ documentIds: ["first", "second"], type: "folder" });
  });

  it("normalizes, toggles, and reorders persisted selection", () => {
    const valid = new Set(["a", "b", "c"]);
    expect(normalizeSelectedIds(["c", "missing", "c", "a"], valid)).toEqual(["c", "a"]);
    expect(toggleSelectedIds(["c"], ["a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(toggleSelectedIds(["c", "a", "b"], ["a", "b"], ["a", "b", "c"])).toEqual(["c"]);
    expect(moveSelectedId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveSelectedId(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("does not separately list content embedded in an exportable resource", () => {
    const { children, resources } = tree([
      resource("board", "lunaris.kanban", "__root__"),
      resource("embedded", "lunaris.rich-text", "board"),
    ]);
    const items = buildExportableItems(
      resources,
      children,
      new Map([["lunaris.rich-text", "Rich Text"], ["lunaris.kanban", "Kanban"]]),
    );

    expect(orderedDocumentIds(items)).toEqual(["board"]);
  });
});
