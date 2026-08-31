import { describe, expect, test } from "bun:test";
import { Doc } from "yjs";
import extension, {
  DOSSIER_SCHEMA_ID,
  DOSSIER_VIEW_ID,
  dossierResourceType,
  dossierView,
} from "../src/index";
import { createDossierResource, openDossierResource } from "../src/dashboard";
import { DEFAULT_DOSSIER, DOSSIER_MAP_NAME, DOSSIER_RECORD_KEY } from "../src/domain";

describe("Demo extension activation", () => {
  test("registers namespaced resource/view contributions synchronously", () => {
    const registrations = {
      resourceType: [] as unknown[],
      view: [] as unknown[],
    };

    const result = extension.activate({
      contributions: {
        resourceType: (value: unknown) => registrations.resourceType.push(value),
        view: (value: unknown) => registrations.view.push(value),
      },
    } as never);

    expect(result).toBeUndefined();
    expect(registrations.resourceType).toEqual([dossierResourceType]);
    expect(registrations.view).toHaveLength(2);
    expect(registrations.view).toContain(dossierView);
    expect(dossierResourceType).toMatchObject({
      defaultViewId: DOSSIER_VIEW_ID,
      hierarchy: { userCreatable: true, visible: true },
      resourceTypeId: "lunaris.demo.customer-dossier",
      schema: { currentVersion: 1, id: DOSSIER_SCHEMA_ID },
      storage: { content: { kind: "yjs" } },
    });
    expect(dossierView).toMatchObject({
      statusBar: expect.any(Function),
      storageRequirements: { content: "yjs" },
      target: {
        kind: "resource",
        resourceTypeIds: ["lunaris.demo.customer-dossier"],
      },
      viewId: dossierResourceType.defaultViewId,
    });
    expect(extension.manifest.api).toBe("^0.9.0");
    expect(extension.manifest.version).toBe("0.0.1");
  });

  test("creates and opens dossier resources through the host APIs", async () => {
    const createResource = (input: unknown) => Promise.resolve({
      name: "Alder & Finch Labs — Customer dossier",
      resourceId: "resource-1",
      storage: { content: { kind: "yjs", storageId: "storage-1" } },
      input,
    });
    const created = await createDossierResource({ createResource } as never);
    expect(created).toMatchObject({
      resourceId: "resource-1",
      storage: { content: { kind: "yjs", storageId: "storage-1" } },
    });
    expect((created as typeof created & { input: unknown }).input).toEqual({
      name: "Alder & Finch Labs — Customer dossier",
      parentId: "__root__",
      resourceTypeId: "lunaris.demo.customer-dossier",
    });

    let opened: unknown;
    openDossierResource(
      { openResource: (input) => { opened = input; } },
      {
        name: "Customer dossier",
        resourceId: "resource-1",
        schemaVersion: 1,
      },
    );
    expect(opened).toEqual({
      resourceId: "resource-1",
      resourceTypeId: "lunaris.demo.customer-dossier",
      schemaVersion: 1,
      title: "Customer dossier",
    });
  });

  test("preserves the existing Yjs map and serialized dossier payload", async () => {
    const document = new Doc();
    dossierResourceType.storage.content.initialize(document, {
      createdAt: "2026-08-25T00:00:00.000Z",
      parentId: null,
      resourceId: "resource-1",
      userId: null,
    });
    const stored = document.getMap<string>(DOSSIER_MAP_NAME).get(DOSSIER_RECORD_KEY);
    expect(stored).toBe(JSON.stringify(DEFAULT_DOSSIER));
    const payload = await dossierResourceType.schema.read({
      resourceId: "resource-1",
      storage: { content: { document, kind: "yjs" } },
    });
    expect(dossierResourceType.schema.versions[1]?.["~standard"].validate(payload)).toMatchObject({
      value: DEFAULT_DOSSIER,
    });

  });
});
