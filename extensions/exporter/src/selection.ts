import {
  isPluginResourceFolder,
  PLUGIN_PROJECT_ROOT_ID,
  type PluginResource,
  type PluginResourceChildrenMap,
  type PluginResourcesMap,
} from "@lunarisapp/plugin-sdk";

export interface ExportableDocumentItem {
  depth: number;
  label: string;
  resource: PluginResource;
  type: "document";
}

export interface ExportableFolderItem {
  depth: number;
  documentIds: string[];
  id: string;
  name: string;
  type: "folder";
}

export type ExportableItem = ExportableDocumentItem | ExportableFolderItem;

export function buildExportableItems(
  resources: PluginResourcesMap,
  children: PluginResourceChildrenMap,
  labelsByType: ReadonlyMap<string, string>,
): ExportableItem[] {
  const items: ExportableItem[] = [];
  const visited = new Set<string>();
  const markDescendantsVisited = (resourceId: string) => {
    for (const child of children.get(resourceId) ?? []) {
      if (visited.has(child.resourceId)) continue;
      visited.add(child.resourceId);
      markDescendantsVisited(child.resourceId);
    }
  };

  const visit = (resource: PluginResource, depth: number): { documentIds: string[]; items: ExportableItem[] } => {
    if (visited.has(resource.resourceId)) return { documentIds: [], items: [] };
    visited.add(resource.resourceId);
    const label = labelsByType.get(resource.resourceTypeId);
    if (label) {
      // A representation receives its descendants in the resource snapshot, so
      // exporting child resources separately would duplicate embedded content.
      markDescendantsVisited(resource.resourceId);
      return {
        documentIds: [resource.resourceId],
        items: [{ depth, label, resource, type: "document" }],
      };
    }
    if (!isPluginResourceFolder(resource)) {
      markDescendantsVisited(resource.resourceId);
      return { documentIds: [], items: [] };
    }
    const childResults = (children.get(resource.resourceId) ?? [])
      .map((child) => visit(child, depth + 1));
    const documentIds = childResults.flatMap((result) => result.documentIds);
    if (documentIds.length === 0) return { documentIds, items: [] };
    return {
      documentIds,
      items: [{
        depth,
        documentIds,
        id: resource.resourceId,
        name: resource.name ?? "",
        type: "folder",
      }, ...childResults.flatMap((result) => result.items)],
    };
  };

  const roots = [
    ...(children.get(PLUGIN_PROJECT_ROOT_ID) ?? []),
    ...(children.get(null) ?? []),
  ];
  for (const root of roots) items.push(...visit(root, 0).items);
  for (const resource of resources.values()) {
    if (!visited.has(resource.resourceId)) items.push(...visit(resource, 0).items);
  }
  return items;
}

export function orderedDocumentIds(items: ExportableItem[]): string[] {
  return items.flatMap((item) => item.type === "document" ? [item.resource.resourceId] : []);
}

export function normalizeSelectedIds(value: unknown, validIds: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((id): id is string => {
    if (typeof id !== "string" || !validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function toggleSelectedIds(
  selectedIds: string[],
  targetIds: string[],
  fallbackOrder: string[],
): string[] {
  const selected = new Set(selectedIds);
  const selecting = targetIds.some((id) => !selected.has(id));
  for (const id of targetIds) {
    if (selecting) selected.add(id);
    else selected.delete(id);
  }
  const existing = selectedIds.filter((id) => selected.has(id));
  const appended = fallbackOrder.filter((id) => selected.has(id) && !existing.includes(id));
  return [...existing, ...appended];
}

export function moveSelectedId(selectedIds: string[], resourceId: string, offset: -1 | 1): string[] {
  const index = selectedIds.indexOf(resourceId);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= selectedIds.length) return selectedIds;
  const next = [...selectedIds];
  const current = next[index];
  const target = next[nextIndex];
  if (current === undefined || target === undefined) return selectedIds;
  [next[index], next[nextIndex]] = [target, current];
  return next;
}
