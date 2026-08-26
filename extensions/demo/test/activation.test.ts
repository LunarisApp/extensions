import { describe, expect, test } from "bun:test";
import { Doc, encodeStateAsUpdateV2 } from "yjs";
import extension, {
  DOSSIER_SCHEMA_ID,
  DOSSIER_VIEW_ID,
  dossierRepresentation,
  dossierResourceType,
  dossierView,
} from "../src/index";
import { createDossierResource, openDossierResource } from "../src/dashboard";
import { DEFAULT_DOSSIER, DOSSIER_MAP_NAME, DOSSIER_RECORD_KEY } from "../src/domain";

describe("Demo extension activation", () => {
  test("registers namespaced resource/view contributions synchronously", () => {
    const registrations = {
      representation: [] as unknown[],
      resourceType: [] as unknown[],
      view: [] as unknown[],
    };

    const result = extension.activate({
      contributions: {
        representation: (value: unknown) => registrations.representation.push(value),
        resourceType: (value: unknown) => registrations.resourceType.push(value),
        view: (value: unknown) => registrations.view.push(value),
      },
    } as never);

    expect(result).toBeUndefined();
    expect(registrations.resourceType).toEqual([dossierResourceType]);
    expect(registrations.representation).toEqual([dossierRepresentation]);
    expect(registrations.view).toHaveLength(2);
    expect(registrations.view).toContain(dossierView);
    expect(dossierResourceType).toMatchObject({
      defaultViewId: DOSSIER_VIEW_ID,
      hierarchy: { userCreatable: true, visible: true },
      resourceTypeId: "lunaris.demo.customer-dossier",
      schema: { currentVersion: 1, id: DOSSIER_SCHEMA_ID },
      storage: { kind: "yjs" },
    });
    expect(dossierView).toMatchObject({
      statusBar: expect.any(Function),
      target: {
        kind: "resource",
        resourceTypeIds: ["lunaris.demo.customer-dossier"],
      },
      viewId: dossierResourceType.defaultViewId,
    });
    expect(extension.manifest.api).toBe("^0.6.0");
    expect(extension.manifest.version).toBe("0.0.1");
  });

  test("creates and opens dossier resources through the host APIs", async () => {
    const createResource = (input: unknown) => Promise.resolve({
      documentId: "document-1",
      name: "Alder & Finch Labs — Customer dossier",
      resourceId: "resource-1",
      input,
    });
    const created = await createDossierResource({ createResource } as never);
    expect(created).toMatchObject({ documentId: "document-1", resourceId: "resource-1" });
    expect((created as typeof created & { input: unknown }).input).toEqual({
      name: "Alder & Finch Labs — Customer dossier",
      parentId: "__root__",
      resourceTypeId: "lunaris.demo.customer-dossier",
    });

    let opened: unknown;
    openDossierResource(
      { openResource: (input) => { opened = input; } },
      {
        documentId: "document-1",
        name: "Customer dossier",
        resourceId: "resource-1",
        schemaVersion: 1,
      },
    );
    expect(opened).toEqual({
      documentId: "document-1",
      resourceId: "resource-1",
      resourceTypeId: "lunaris.demo.customer-dossier",
      schemaVersion: 1,
      title: "Customer dossier",
    });
  });

  test("preserves the existing Yjs map and serialized dossier payload", async () => {
    const document = new Doc();
    dossierResourceType.storage.initialize(document, {
      createdAt: "2026-08-25T00:00:00.000Z",
      documentId: "document-1",
      parentId: null,
      resourceId: "resource-1",
      userId: null,
    });
    const stored = document.getMap<string>(DOSSIER_MAP_NAME).get(DOSSIER_RECORD_KEY);
    expect(stored).toBe(JSON.stringify(DEFAULT_DOSSIER));
    const payload = await dossierResourceType.schema.read({
      document,
      documentId: "document-1",
      resourceId: "resource-1",
    });
    expect(dossierResourceType.schema.versions[1]?.["~standard"].validate(payload)).toMatchObject({
      value: DEFAULT_DOSSIER,
    });

    const updateBase64 = btoa(
      String.fromCharCode(...encodeStateAsUpdateV2(document)),
    );
    const compiled = await dossierRepresentation.getContent("document-1", {
      getYjsDocumentUpdates: () => Promise.resolve([{ updateBase64 }]),
    } as never);
    expect(compiled.title).toBe("Alder & Finch Labs — Customer dossier");
    expect(compiled.sections.some((section) => section.type === "group")).toBe(true);
  });
});
