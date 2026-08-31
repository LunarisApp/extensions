import { describe, expect, test } from "bun:test";
import type { PluginResource } from "@lunarisapp/plugin-sdk";
import {
  applyAccountAction,
  CONTENT_TYPE_ID,
  createOperationEntry,
  customerDossierSchema,
  DEFAULT_DOSSIER,
  deriveMetrics,
  filterCustomers,
  findDossierResource,
  INITIAL_CUSTOMERS,
  parseDossierRecord,
  sortCustomers,
} from "../src/domain";

describe("customer ledger helpers", () => {
  test("searches account names, domains, and organization IDs case-insensitively", () => {
    const baseFilters = { health: "all" as const, status: "all" as const };
    expect(filterCustomers(INITIAL_CUSTOMERS, { ...baseFilters, search: "BRIGHTLOOP" })).toHaveLength(1);
    expect(filterCustomers(INITIAL_CUSTOMERS, { ...baseFilters, search: "mossbank.example.test" })[0]?.name).toBe("Mossbank AI");
    expect(filterCustomers(INITIAL_CUSTOMERS, { ...baseFilters, search: "ORG_DEMO_03CS" })[0]?.name).toBe("Cinderlane Systems");
  });

  test("combines health and status filters", () => {
    const result = filterCustomers(INITIAL_CUSTOMERS, {
      health: "watch",
      search: "",
      status: "trial",
    });
    expect(result.map((customer) => customer.name)).toEqual([
      "Fieldnote Cloud",
      "Kiteframe Studio",
    ]);
  });

  test("sorts revenue and renewal without mutating the source", () => {
    const originalFirst = INITIAL_CUSTOMERS[0];
    const byMrr = sortCustomers(INITIAL_CUSTOMERS, { direction: "desc", field: "mrr" });
    const byRenewal = sortCustomers(INITIAL_CUSTOMERS, { direction: "asc", field: "renewal" });
    expect(byMrr[0]?.name).toBe("Dockside Metric");
    expect(byRenewal[0]?.renewalDays).toBe(3);
    expect(INITIAL_CUSTOMERS[0]).toBe(originalFirst);
  });

  test("derives metrics from the current session state", () => {
    const before = deriveMetrics(INITIAL_CUSTOMERS);
    const suspended = applyAccountAction(INITIAL_CUSTOMERS, "org_demo_01AF", "toggle-suspension");
    const after = deriveMetrics(suspended);
    expect(before.accounts).toBe(12);
    expect(before.atRisk).toBe(3);
    expect(before.openCases).toBe(17);
    expect(after.currentMrr).toBe(before.currentMrr - 24_500);
  });

  test("extends eligible trials and toggles suspension", () => {
    const extended = applyAccountAction(INITIAL_CUSTOMERS, "org_demo_10KS", "extend-trial");
    expect(extended.find((customer) => customer.id === "org_demo_10KS")?.trialDaysLeft).toBe(11);

    const reactivated = applyAccountAction(INITIAL_CUSTOMERS, "org_demo_12MA", "toggle-suspension");
    expect(reactivated.find((customer) => customer.id === "org_demo_12MA")?.status).toBe("active");
  });

  test("creates deterministic operation shape", () => {
    const operation = createOperationEntry(
      "Trial extended",
      "positive",
      new Date("2026-08-13T10:15:00.000Z"),
    );
    expect(operation.actor).toBe("Demo operator");
    expect(operation.message).toBe("Trial extended");
    expect(operation.tone).toBe("positive");
    expect(operation.id).toContain("1786616100000");
  });
});

describe("customer dossier helpers", () => {
  test("finds the first dossier while allowing additional resources", () => {
    const resources = new Map<string, PluginResource>([
      ["folder", {
        name: "Folder",
        parentId: null,
        resourceId: "folder",
        resourceTypeId: "lunaris.folder",
        schemaVersion: 1,
        storage: {},
      }],
      ["dossier-1", {
        name: "Customer dossier",
        parentId: null,
        resourceId: "dossier-1",
        resourceTypeId: CONTENT_TYPE_ID,
        schemaVersion: 1,
        storage: { content: { kind: "yjs", storageId: "storage-1" } },
      }],
      ["dossier-2", {
        name: "Another dossier",
        parentId: null,
        resourceId: "dossier-2",
        resourceTypeId: CONTENT_TYPE_ID,
        schemaVersion: 1,
        storage: { content: { kind: "yjs", storageId: "storage-2" } },
      }],
    ]);
    expect(findDossierResource(resources)?.resourceId).toBe("dossier-1");
    expect([...resources.values()].filter((resource) => resource.resourceTypeId === CONTENT_TYPE_ID)).toHaveLength(2);
  });

  test("validates the existing version-1 logical payload", () => {
    expect(customerDossierSchema.safeParse(DEFAULT_DOSSIER).success).toBe(true);
    expect(customerDossierSchema.safeParse({ ...DEFAULT_DOSSIER, risks: "high" }).success).toBe(false);
  });

  test("normalizes malformed persisted dossier fields", () => {
    const dossier = parseDossierRecord({
      company: 42,
      health: "unknown",
      mrr: -100,
      risks: ["invalid"],
      seatsLimit: 0,
      seatsUsed: 500,
    });
    expect(dossier.company).toBe(DEFAULT_DOSSIER.company);
    expect(dossier.health).toBe(DEFAULT_DOSSIER.health);
    expect(dossier.mrr).toBe(0);
    expect(dossier.seatsLimit).toBe(1);
    expect(dossier.seatsUsed).toBe(1);
    expect(dossier.risks).toEqual([]);
    expect(dossier.stakeholders).toEqual(DEFAULT_DOSSIER.stakeholders);
  });
});
