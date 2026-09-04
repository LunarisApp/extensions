import { describe, expect, test } from "bun:test";
import extension, {
  NORTHSTAR_PULSE_ID,
  NORTHSTAR_PULSE_SCHEMA_ID,
  NORTHSTAR_PULSE_VIEW_ID,
  northstarPulseResourceType,
  northstarPulseView,
} from "../src/index";
import { PULSE_STORAGE_KEY, pulseSnapshotSchema } from "../src/domain";

describe("Northstar Pulse activation", () => {
  test("registers one resource type and its compatible default view", () => {
    const registrations = { resourceType: [] as unknown[], view: [] as unknown[] };
    const result = extension.activate({
      contributions: {
        resourceType: (value: unknown) => registrations.resourceType.push(value),
        view: (value: unknown) => registrations.view.push(value),
      },
    } as never);

    expect(result).toBeUndefined();
    expect(registrations.resourceType).toEqual([northstarPulseResourceType]);
    expect(registrations.view).toEqual([northstarPulseView]);
    expect(northstarPulseResourceType).toMatchObject({
      defaultViewId: NORTHSTAR_PULSE_VIEW_ID,
      hierarchy: { userCreatable: true, visible: true },
      resourceTypeId: NORTHSTAR_PULSE_ID,
      schema: { currentVersion: 1, id: NORTHSTAR_PULSE_SCHEMA_ID },
      storage: { pulse: { kind: "key-value" } },
    });
    expect(northstarPulseResourceType.schema.write).toBeUndefined();
    expect(northstarPulseView).toMatchObject({
      storageRequirements: { pulse: "key-value" },
      target: {
        kind: "resource",
        resourceTypeIds: [NORTHSTAR_PULSE_ID],
        schemas: [{ id: NORTHSTAR_PULSE_SCHEMA_ID, maximumVersion: 1, minimumVersion: 1 }],
      },
      viewId: northstarPulseResourceType.defaultViewId,
    });
    expect(extension.manifest.id).toBe("lunaris.demo");
    expect(extension.manifest.name).toBe("Northstar Pulse (Demo)");
    expect(extension.manifest.version).toBe("0.0.1");
    expect(extension.manifest.permissions).toEqual(["content.read", "content.write"]);
  });

  test("initializes and resolves a schema-valid key-value snapshot", async () => {
    const initialize = northstarPulseResourceType.storage.pulse.initialize;
    expect(initialize).toBeFunction();
    const values = await initialize?.({
      createdAt: "2026-09-03T09:30:00.000Z",
      parentId: null,
      resourceId: "pulse-1",
      userId: null,
    });
    const stored = values?.[PULSE_STORAGE_KEY];
    expect(pulseSnapshotSchema.safeParse(stored).success).toBeTrue();

    const payload = await northstarPulseResourceType.schema.read({
      resourceId: "pulse-1",
      storage: { pulse: { kind: "key-value", values: values ?? {} } },
    });
    expect(payload).toBe(stored);
  });

  test("rejects resources without the declared key-value storage", () => {
    expect(() => northstarPulseResourceType.schema.read({
      resourceId: "pulse-1",
      storage: {},
    })).toThrow("Northstar Pulse key-value storage is unavailable");
  });
});
