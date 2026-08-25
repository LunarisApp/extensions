import type {
  CompileContent,
  PluginResource,
} from "@lunarisapp/plugin-sdk";
import { z } from "zod";
import { DEFAULT_DOSSIER, INITIAL_CUSTOMERS, INITIAL_OPERATIONS } from "./sample-data";

export { DEFAULT_DOSSIER, INITIAL_CUSTOMERS, INITIAL_OPERATIONS };

export const CONTENT_TYPE_ID = "lunaris.demo.customer-dossier";
export const DOSSIER_MAP_NAME = "customer-dossier";
export const DOSSIER_RECORD_KEY = "record";

export type AccountHealth = "healthy" | "risk" | "watch";
export type AccountStatus = "active" | "suspended" | "trial";
export type CustomerPlan = "Enterprise" | "Scale" | "Starter";
export type SortDirection = "asc" | "desc";
export type SortField = "account" | "health" | "mrr" | "renewal";

export interface CustomerAccount {
  domain: string;
  health: AccountHealth;
  id: string;
  initials: string;
  lastActive: string;
  mrr: number;
  name: string;
  openCases: number;
  owner: string;
  plan: CustomerPlan;
  previousMrr: number;
  renewalDate: string;
  renewalDays: number;
  seatsLimit: number;
  seatsUsed: number;
  status: AccountStatus;
  trialDaysLeft?: number;
}
export interface AccountFilters {
  health: "all" | AccountHealth;
  search: string;
  status: "all" | AccountStatus;
}

export interface SortState {
  direction: SortDirection;
  field: SortField;
}

export type AccountAction = "extend-trial" | "reset-2fa" | "toggle-suspension";

export interface OperationEntry {
  actor: string;
  id: string;
  message: string;
  time: string;
  tone: "danger" | "neutral" | "positive" | "warning";
}

export interface DossierRisk {
  detail: string;
  label: string;
  severity: "medium" | "high";
}

export interface DossierStakeholder {
  email: string;
  name: string;
  role: string;
}

export interface DossierTimelineEvent {
  date: string;
  detail: string;
  title: string;
}

export interface CustomerDossier {
  company: string;
  domain: string;
  health: AccountHealth;
  mrr: number;
  notes: string;
  organizationId: string;
  owner: string;
  plan: CustomerPlan;
  renewalDate: string;
  risks: DossierRisk[];
  seatsLimit: number;
  seatsUsed: number;
  stakeholders: DossierStakeholder[];
  timeline: DossierTimelineEvent[];
}

export const customerDossierSchema = z.object({
  company: z.string(),
  domain: z.string(),
  health: z.enum(["healthy", "risk", "watch"]),
  mrr: z.number().finite().nonnegative(),
  notes: z.string(),
  organizationId: z.string(),
  owner: z.string(),
  plan: z.enum(["Enterprise", "Scale", "Starter"]),
  renewalDate: z.string(),
  risks: z.array(z.object({
    detail: z.string(),
    label: z.string(),
    severity: z.enum(["medium", "high"]),
  })),
  seatsLimit: z.number().finite().positive(),
  seatsUsed: z.number().finite().nonnegative(),
  stakeholders: z.array(z.object({
    email: z.string(),
    name: z.string(),
    role: z.string(),
  })),
  timeline: z.array(z.object({
    date: z.string(),
    detail: z.string(),
    title: z.string(),
  })),
});

export function filterCustomers(
  customers: CustomerAccount[],
  filters: AccountFilters,
): CustomerAccount[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return customers.filter((customer) => {
    const matchesQuery =
      query.length === 0 ||
      customer.name.toLocaleLowerCase().includes(query) ||
      customer.domain.toLocaleLowerCase().includes(query) ||
      customer.id.toLocaleLowerCase().includes(query);
    const matchesHealth = filters.health === "all" || customer.health === filters.health;
    const matchesStatus = filters.status === "all" || customer.status === filters.status;
    return matchesQuery && matchesHealth && matchesStatus;
  });
}

const healthRank: Record<AccountHealth, number> = { healthy: 0, watch: 1, risk: 2 };

export function sortCustomers(
  customers: CustomerAccount[],
  sort: SortState,
): CustomerAccount[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...customers].sort((left, right) => {
    if (sort.field === "account") return direction * left.name.localeCompare(right.name);
    if (sort.field === "health") return direction * (healthRank[left.health] - healthRank[right.health]);
    if (sort.field === "mrr") return direction * (left.mrr - right.mrr);
    return direction * (left.renewalDays - right.renewalDays);
  });
}

export function deriveMetrics(customers: CustomerAccount[]) {
  const revenueAccounts = customers.filter((customer) => customer.status !== "suspended");
  const currentMrr = revenueAccounts.reduce((sum, customer) => sum + customer.mrr, 0);
  const previousMrr = revenueAccounts.reduce((sum, customer) => sum + customer.previousMrr, 0);
  return {
    accounts: customers.length,
    atRisk: customers.filter((customer) => customer.health === "risk").length,
    currentMrr,
    netRevenueRetention: previousMrr === 0 ? 0 : (currentMrr / previousMrr) * 100,
    openCases: customers.reduce((sum, customer) => sum + customer.openCases, 0),
  };
}

export function applyAccountAction(
  customers: CustomerAccount[],
  customerId: string,
  action: AccountAction,
): CustomerAccount[] {
  return customers.map((customer) => {
    if (customer.id !== customerId) return customer;
    if (action === "extend-trial" && customer.status === "trial") {
      return {
        ...customer,
        renewalDays: customer.renewalDays + 7,
        trialDaysLeft: (customer.trialDaysLeft ?? 0) + 7,
      };
    }
    if (action === "toggle-suspension") {
      return {
        ...customer,
        status: customer.status === "suspended" ? "active" : "suspended",
      };
    }
    return customer;
  });
}

export function createOperationEntry(
  message: string,
  tone: OperationEntry["tone"] = "neutral",
  now = new Date(),
): OperationEntry {
  return {
    actor: "Demo operator",
    id: `op-${now.getTime()}-${message}`,
    message,
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    tone,
  };
}

export function findDossierResource(resources: Map<string, PluginResource>) {
  return [...resources.values()].find(
    (resource) => resource.resourceTypeId === CONTENT_TYPE_ID,
  ) ?? null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? value as UnknownRecord : null;
}

function readText(source: UnknownRecord, key: keyof CustomerDossier, fallback: string) {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readNumber(
  source: UnknownRecord,
  key: keyof CustomerDossier,
  fallback: number,
  minimum = 0,
) {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, value)
    : fallback;
}

function readEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return typeof value === "string" && allowed.includes(value as Value)
    ? value as Value
    : fallback;
}

function readList<Item>(
  value: unknown,
  fallback: Item[],
  parse: (record: UnknownRecord) => Item | null,
): Item[] {
  if (!Array.isArray(value)) return fallback;
  return value.flatMap((candidate) => {
    const record = asRecord(candidate);
    if (!record) return [];
    const item = parse(record);
    return item ? [item] : [];
  });
}

function parseStakeholder(record: UnknownRecord): DossierStakeholder | null {
  const { email, name, role } = record;
  return typeof email === "string" && typeof name === "string" && typeof role === "string"
    ? { email, name, role }
    : null;
}

function parseRisk(record: UnknownRecord): DossierRisk | null {
  const { detail, label, severity } = record;
  if (typeof detail !== "string" || typeof label !== "string") return null;
  return { detail, label, severity: severity === "high" ? "high" : "medium" };
}

function parseTimelineEvent(record: UnknownRecord): DossierTimelineEvent | null {
  const { date, detail, title } = record;
  return typeof date === "string" && typeof detail === "string" && typeof title === "string"
    ? { date, detail, title }
    : null;
}

export function parseDossierRecord(value: unknown): CustomerDossier {
  const source = asRecord(value);
  if (!source) return DEFAULT_DOSSIER;

  const seatsLimit = readNumber(source, "seatsLimit", DEFAULT_DOSSIER.seatsLimit, 1);
  const seatsUsed = Math.min(
    readNumber(source, "seatsUsed", DEFAULT_DOSSIER.seatsUsed),
    seatsLimit,
  );

  return {
    company: readText(source, "company", DEFAULT_DOSSIER.company),
    domain: readText(source, "domain", DEFAULT_DOSSIER.domain),
    health: readEnum(source.health, ["healthy", "risk", "watch"], DEFAULT_DOSSIER.health),
    mrr: readNumber(source, "mrr", DEFAULT_DOSSIER.mrr),
    notes: readText(source, "notes", DEFAULT_DOSSIER.notes),
    organizationId: readText(source, "organizationId", DEFAULT_DOSSIER.organizationId),
    owner: readText(source, "owner", DEFAULT_DOSSIER.owner),
    plan: readEnum(source.plan, ["Enterprise", "Scale", "Starter"], DEFAULT_DOSSIER.plan),
    renewalDate: readText(source, "renewalDate", DEFAULT_DOSSIER.renewalDate),
    risks: readList(source.risks, DEFAULT_DOSSIER.risks, parseRisk),
    seatsLimit,
    seatsUsed,
    stakeholders: readList(source.stakeholders, DEFAULT_DOSSIER.stakeholders, parseStakeholder),
    timeline: readList(source.timeline, DEFAULT_DOSSIER.timeline, parseTimelineEvent),
  };
}

export function buildDossierCompileContent(dossier: CustomerDossier): CompileContent {
  return {
    title: `${dossier.company} — Customer dossier`,
    sections: [
      { level: 1, text: dossier.company, type: "heading" },
      { text: "Synthetic customer dossier generated by the Demo extension.", type: "paragraph" },
      {
        border: true,
        sections: [
          {
            entries: [
              { key: "Organization ID", value: dossier.organizationId },
              { key: "Domain", value: dossier.domain },
              { key: "Plan", value: dossier.plan },
              { key: "Monthly recurring revenue", value: `$${dossier.mrr.toLocaleString("en-US")}` },
              { key: "Owner", value: dossier.owner },
              { key: "Renewal", value: dossier.renewalDate },
              { key: "Seat usage", value: `${dossier.seatsUsed} of ${dossier.seatsLimit}` },
            ],
            layout: "table",
            type: "key-value",
          },
        ],
        title: "Account summary",
        type: "group",
      },
      { level: 2, text: "Risk signals", type: "heading" },
      {
        items: dossier.risks.map((risk) => ({
          text: `${risk.label} (${risk.severity}): ${risk.detail}`,
        })),
        style: "bullet",
        type: "list",
      },
      { level: 2, text: "Stakeholders", type: "heading" },
      {
        headers: ["Name", "Role", "Email"],
        rows: dossier.stakeholders.map((person) => [person.name, person.role, person.email]),
        type: "table",
      },
      { level: 2, text: "Recent timeline", type: "heading" },
      {
        items: dossier.timeline.map((event) => ({
          text: `${event.date} — ${event.title}: ${event.detail}`,
        })),
        style: "bullet",
        type: "list",
      },
      { style: "solid", type: "divider" },
      { level: 2, text: "Operator notes", type: "heading" },
      { text: dossier.notes, type: "paragraph" },
    ],
  };
}
