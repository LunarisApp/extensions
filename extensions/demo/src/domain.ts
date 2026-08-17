import type {
  CompileContent,
  PluginProjectItem,
} from "@lunarisapp/plugin-sdk";

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
  risks: Array<{ detail: string; label: string; severity: "medium" | "high" }>;
  seatsLimit: number;
  seatsUsed: number;
  stakeholders: Array<{ email: string; name: string; role: string }>;
  timeline: Array<{ date: string; detail: string; title: string }>;
}

export const INITIAL_CUSTOMERS: CustomerAccount[] = [
  {
    domain: "alder-finch.example.test",
    health: "watch",
    id: "org_demo_01AF",
    initials: "AF",
    lastActive: "18 min ago",
    mrr: 24_500,
    name: "Alder & Finch Labs",
    openCases: 1,
    owner: "Elena Park",
    plan: "Enterprise",
    previousMrr: 23_100,
    renewalDate: "Sep 18, 2026",
    renewalDays: 36,
    seatsLimit: 120,
    seatsUsed: 82,
    status: "active",
  },
  {
    domain: "brightloop.example.test",
    health: "healthy",
    id: "org_demo_02BR",
    initials: "BR",
    lastActive: "1 hr ago",
    mrr: 8_750,
    name: "Brightloop Research",
    openCases: 0,
    owner: "Mika Rowan",
    plan: "Scale",
    previousMrr: 8_200,
    renewalDate: "Oct 12, 2026",
    renewalDays: 60,
    seatsLimit: 50,
    seatsUsed: 34,
    status: "active",
  },
  {
    domain: "cinderlane.example.test",
    health: "watch",
    id: "org_demo_03CS",
    initials: "CS",
    lastActive: "7 days ago",
    mrr: 2_400,
    name: "Cinderlane Systems",
    openCases: 2,
    owner: "Aisha Bell",
    plan: "Starter",
    previousMrr: 2_400,
    renewalDate: "Aug 25, 2026",
    renewalDays: 12,
    seatsLimit: 10,
    seatsUsed: 8,
    status: "active",
  },
  {
    domain: "dockside-metric.example.test",
    health: "healthy",
    id: "org_demo_04DM",
    initials: "DM",
    lastActive: "32 min ago",
    mrr: 31_000,
    name: "Dockside Metric",
    openCases: 1,
    owner: "Theo Moss",
    plan: "Enterprise",
    previousMrr: 28_500,
    renewalDate: "Nov 03, 2026",
    renewalDays: 82,
    seatsLimit: 150,
    seatsUsed: 121,
    status: "active",
  },
  {
    domain: "evervale.example.test",
    health: "risk",
    id: "org_demo_05ER",
    initials: "ER",
    lastActive: "14 days ago",
    mrr: 6_000,
    name: "Evervale Robotics",
    openCases: 3,
    owner: "Elena Park",
    plan: "Scale",
    previousMrr: 7_500,
    renewalDate: "Aug 19, 2026",
    renewalDays: 6,
    seatsLimit: 40,
    seatsUsed: 25,
    status: "active",
  },
  {
    domain: "fieldnote-cloud.example.test",
    health: "watch",
    id: "org_demo_06FC",
    initials: "FC",
    lastActive: "3 days ago",
    mrr: 1_800,
    name: "Fieldnote Cloud",
    openCases: 2,
    owner: "Mika Rowan",
    plan: "Starter",
    previousMrr: 1_800,
    renewalDate: "Trial",
    renewalDays: 9,
    seatsLimit: 10,
    seatsUsed: 6,
    status: "trial",
    trialDaysLeft: 9,
  },
  {
    domain: "glasswing.example.test",
    health: "healthy",
    id: "org_demo_07GD",
    initials: "GD",
    lastActive: "2 hr ago",
    mrr: 18_900,
    name: "Glasswing Data",
    openCases: 0,
    owner: "Theo Moss",
    plan: "Enterprise",
    previousMrr: 17_400,
    renewalDate: "Sep 01, 2026",
    renewalDays: 19,
    seatsLimit: 75,
    seatsUsed: 60,
    status: "active",
  },
  {
    domain: "harborlight.example.test",
    health: "healthy",
    id: "org_demo_08HO",
    initials: "HO",
    lastActive: "44 min ago",
    mrr: 7_250,
    name: "Harborlight Ops",
    openCases: 1,
    owner: "Aisha Bell",
    plan: "Scale",
    previousMrr: 6_800,
    renewalDate: "Oct 25, 2026",
    renewalDays: 73,
    seatsLimit: 40,
    seatsUsed: 28,
    status: "active",
  },
  {
    domain: "juniper-stack.example.test",
    health: "risk",
    id: "org_demo_09JS",
    initials: "JS",
    lastActive: "21 days ago",
    mrr: 27_500,
    name: "Juniper Stack",
    openCases: 4,
    owner: "Elena Park",
    plan: "Enterprise",
    previousMrr: 31_000,
    renewalDate: "Aug 16, 2026",
    renewalDays: 3,
    seatsLimit: 125,
    seatsUsed: 95,
    status: "active",
  },
  {
    domain: "kiteframe.example.test",
    health: "watch",
    id: "org_demo_10KS",
    initials: "KS",
    lastActive: "10 days ago",
    mrr: 2_000,
    name: "Kiteframe Studio",
    openCases: 0,
    owner: "Mika Rowan",
    plan: "Starter",
    previousMrr: 1_850,
    renewalDate: "Trial",
    renewalDays: 4,
    seatsLimit: 10,
    seatsUsed: 7,
    status: "trial",
    trialDaysLeft: 4,
  },
  {
    domain: "loomwell.example.test",
    health: "healthy",
    id: "org_demo_11LS",
    initials: "LS",
    lastActive: "5 hr ago",
    mrr: 9_550,
    name: "Loomwell Systems",
    openCases: 0,
    owner: "Theo Moss",
    plan: "Scale",
    previousMrr: 8_900,
    renewalDate: "Sep 30, 2026",
    renewalDays: 48,
    seatsLimit: 50,
    seatsUsed: 38,
    status: "active",
  },
  {
    domain: "mossbank.example.test",
    health: "risk",
    id: "org_demo_12MA",
    initials: "MA",
    lastActive: "28 days ago",
    mrr: 12_000,
    name: "Mossbank AI",
    openCases: 3,
    owner: "Aisha Bell",
    plan: "Scale",
    previousMrr: 14_000,
    renewalDate: "Sep 07, 2026",
    renewalDays: 25,
    seatsLimit: 60,
    seatsUsed: 57,
    status: "suspended",
  },
];

export const INITIAL_OPERATIONS: OperationEntry[] = [
  {
    actor: "Demo operator",
    id: "op-1",
    message: "Sample dossier created for Alder & Finch Labs",
    time: "10:15",
    tone: "positive",
  },
  {
    actor: "System",
    id: "op-2",
    message: "Juniper Stack moved to at risk",
    time: "09:42",
    tone: "warning",
  },
  {
    actor: "Billing simulator",
    id: "op-3",
    message: "Payment retry failed for Evervale Robotics",
    time: "08:54",
    tone: "danger",
  },
  {
    actor: "System",
    id: "op-4",
    message: "Seat threshold reached at Mossbank AI",
    time: "07:48",
    tone: "neutral",
  },
];

export const DEFAULT_DOSSIER: CustomerDossier = {
  company: "Alder & Finch Labs",
  domain: "alder-finch.example.test",
  health: "watch",
  mrr: 24_500,
  notes:
    "Synthetic sample: adoption is strong in the analytics team, while the operations group still needs an enablement session before renewal review.",
  organizationId: "org_demo_01AF",
  owner: "Elena Park",
  plan: "Enterprise",
  renewalDate: "September 18, 2026",
  risks: [
    {
      detail: "Operations workspace activity is down 24% over the last 30 days.",
      label: "Adoption drift",
      severity: "medium",
    },
    {
      detail: "Security review is open with two unanswered control questions.",
      label: "Security review",
      severity: "high",
    },
  ],
  seatsLimit: 120,
  seatsUsed: 82,
  stakeholders: [
    { email: "mina@alder-finch.example.test", name: "Mina Vale", role: "Executive sponsor" },
    { email: "rohan@alder-finch.example.test", name: "Rohan Pike", role: "Workspace admin" },
    { email: "elle@alder-finch.example.test", name: "Elle North", role: "Security lead" },
  ],
  timeline: [
    { date: "Aug 11", detail: "Eight operators completed the workflow lab.", title: "Enablement session" },
    { date: "Aug 07", detail: "Owner acknowledged the adoption drift signal.", title: "Health review" },
    { date: "Jul 29", detail: "Seat allocation increased from 100 to 120.", title: "Plan updated" },
  ],
};

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

export function findDossierItem(items: Map<string, PluginProjectItem>) {
  return [...items.values()].find((item) => item.pluginId === CONTENT_TYPE_ID) ?? null;
}

export function parseDossierRecord(value: unknown): CustomerDossier {
  if (!value || typeof value !== "object") return DEFAULT_DOSSIER;
  const source = value as Record<string, unknown>;
  const text = (key: keyof CustomerDossier, fallback: string) =>
    typeof source[key] === "string" && source[key].trim().length > 0
      ? source[key]
      : fallback;
  const number = (key: keyof CustomerDossier, fallback: number, minimum = 0) =>
    typeof source[key] === "number" && Number.isFinite(source[key])
      ? Math.max(minimum, source[key])
      : fallback;
  const health = source.health === "healthy" || source.health === "risk" || source.health === "watch"
    ? source.health
    : DEFAULT_DOSSIER.health;
  const plan = source.plan === "Enterprise" || source.plan === "Scale" || source.plan === "Starter"
    ? source.plan
    : DEFAULT_DOSSIER.plan;
  const seatsLimit = number("seatsLimit", DEFAULT_DOSSIER.seatsLimit, 1);
  const seatsUsed = Math.min(number("seatsUsed", DEFAULT_DOSSIER.seatsUsed), seatsLimit);
  const stakeholders = Array.isArray(source.stakeholders)
    ? source.stakeholders.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      if (typeof item.name !== "string" || typeof item.role !== "string" || typeof item.email !== "string") return [];
      return [{ email: item.email, name: item.name, role: item.role }];
    })
    : DEFAULT_DOSSIER.stakeholders;
  const risks = Array.isArray(source.risks)
    ? source.risks.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      if (typeof item.label !== "string" || typeof item.detail !== "string") return [];
      return [{
        detail: item.detail,
        label: item.label,
        severity: item.severity === "high" ? "high" as const : "medium" as const,
      }];
    })
    : DEFAULT_DOSSIER.risks;
  const timeline = Array.isArray(source.timeline)
    ? source.timeline.flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const item = candidate as Record<string, unknown>;
      if (typeof item.date !== "string" || typeof item.title !== "string" || typeof item.detail !== "string") return [];
      return [{ date: item.date, detail: item.detail, title: item.title }];
    })
    : DEFAULT_DOSSIER.timeline;

  return {
    company: text("company", DEFAULT_DOSSIER.company),
    domain: text("domain", DEFAULT_DOSSIER.domain),
    health,
    mrr: number("mrr", DEFAULT_DOSSIER.mrr),
    notes: text("notes", DEFAULT_DOSSIER.notes),
    organizationId: text("organizationId", DEFAULT_DOSSIER.organizationId),
    owner: text("owner", DEFAULT_DOSSIER.owner),
    plan,
    renewalDate: text("renewalDate", DEFAULT_DOSSIER.renewalDate),
    risks,
    seatsLimit,
    seatsUsed,
    stakeholders,
    timeline,
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
