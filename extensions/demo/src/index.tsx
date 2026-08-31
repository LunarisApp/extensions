/*
THESIS: Customer operations should read like a live account ledger, not a grid of dashboard cards.
OWN-WORLD: Near-white and graphite ruled surfaces, cobalt focus, compact tabular data, and restrained health marks.
STORY: Scan portfolio health, narrow the ledger, rehearse an admin action, then open a persistent sample dossier.
FIRST VIEWPORT: A narrow command bar, continuous metric register, dominant customer table, and subordinate operations rail.
FORM: User-pinned Account ledger direction; Impeccable seed cb5fe784; approved comp account-ledger-approved.png.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
*/
import {
  DEFAULT_DOSSIER,
  DOSSIER_MAP_NAME,
  DOSSIER_RECORD_KEY,
  customerDossierSchema,
  parseDossierRecord,
} from "./domain";
import {
  type ResourcePayloadContext,
  type ResourceViewStatusProps,
  definePlugin,
} from "@lunarisapp/plugin-sdk";
import { DashboardSquare01Icon, File02Icon } from "@lunarisapp/ui/icons";
import type { Doc } from "yjs";
import manifest from "../manifest.json";
import { AdminDashboard } from "./dashboard";
import { CustomerDossierRenderer, DossierStatusBar } from "./dossier";
import "./styles.css";

export const DOSSIER_SCHEMA_ID = "lunaris.demo.customer-dossier.document";
export const DOSSIER_VIEW_ID = "lunaris.demo.customer-dossier";

export const dossierResourceType = {
  defaultViewId: DOSSIER_VIEW_ID,
  hierarchy: { userCreatable: true, visible: true },
  icon: File02Icon,
  name: "Customer dossier",
  resourceTypeId: "lunaris.demo.customer-dossier",
  schema: {
    currentVersion: 1,
    id: DOSSIER_SCHEMA_ID,
    read: ({ storage }: ResourcePayloadContext) => {
      const content = storage.content;
      const raw = content?.kind === "yjs"
        ? content.document.getMap<string>(DOSSIER_MAP_NAME).get(DOSSIER_RECORD_KEY)
        : undefined;
      return raw ? JSON.parse(raw) : DEFAULT_DOSSIER;
    },
    versions: { 1: customerDossierSchema },
  },
  storage: {
    content: {
      kind: "yjs" as const,
      initialize: (document: Doc) => {
        const map = document.getMap<string>(DOSSIER_MAP_NAME);
        if (!map.has(DOSSIER_RECORD_KEY)) {
          map.set(DOSSIER_RECORD_KEY, JSON.stringify(DEFAULT_DOSSIER));
        }
      },
    },
  },
};

export const dossierView = {
  icon: File02Icon,
  name: "Customer dossier",
  renderer: CustomerDossierRenderer,
  statusBar: (_props: ResourceViewStatusProps) => <DossierStatusBar />,
  storageRequirements: { content: "yjs" as const },
  target: {
    kind: "resource" as const,
    resourceTypeIds: ["lunaris.demo.customer-dossier"],
    schemas: [{ id: DOSSIER_SCHEMA_ID, minimumVersion: 1, maximumVersion: 1 }],
  },
  viewId: DOSSIER_VIEW_ID,
};

export default definePlugin({
  manifest,
  activate({ contributions }) {
    contributions.view({
      icon: DashboardSquare01Icon,
      name: "Demo",
      renderer: AdminDashboard,
      target: { kind: "standalone", launcher: { defaultPlacement: "primary" } },
      viewId: "lunaris.demo",
    });
    contributions.resourceType(dossierResourceType);
    contributions.view(dossierView);
  },
});
