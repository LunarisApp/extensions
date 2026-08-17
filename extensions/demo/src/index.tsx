/*
THESIS: Customer operations should read like a live account ledger, not a grid of dashboard cards.
OWN-WORLD: Near-white and graphite ruled surfaces, cobalt focus, compact tabular data, and restrained health marks.
STORY: Scan portfolio health, narrow the ledger, rehearse an admin action, then open a persistent sample dossier.
FIRST VIEWPORT: A narrow command bar, continuous metric register, dominant customer table, and subordinate operations rail.
FORM: User-pinned Account ledger direction; Impeccable seed cb5fe784; approved comp account-ledger-approved.png.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
*/
import {
  buildDossierCompileContent,
  DEFAULT_DOSSIER,
  DOSSIER_MAP_NAME,
  DOSSIER_RECORD_KEY,
  parseDossierRecord,
} from "./domain";
import {
  defineExternalContentType,
  defineExternalPlugin,
  defineExternalView,
  withYjsDoc,
} from "@lunarisapp/plugin-sdk";
import { DashboardSquare01Icon, File02Icon } from "@lunarisapp/ui/icons";
import manifest from "../manifest.json";
import { AdminDashboard } from "./dashboard";
import { CustomerDossierRenderer, DossierStatusBar } from "./dossier";
import "./styles.css";

export default defineExternalPlugin({
  manifest,
  modifications: [
    defineExternalView({
      defaultPlacement: "primary",
      icon: DashboardSquare01Icon,
      id: "lunaris.demo",
      name: "Demo",
      renderer: AdminDashboard,
    }),
    defineExternalContentType({
      compilable: true,
      createLabel: "Customer dossier",
      documentStorage: "yjs",
      getCompileContent: (documentId, context) =>
        withYjsDoc(
          context,
          documentId,
          (document) => {
            const raw = document.getMap<string>(DOSSIER_MAP_NAME).get(DOSSIER_RECORD_KEY);
            if (!raw) return buildDossierCompileContent(DEFAULT_DOSSIER);
            try {
              return buildDossierCompileContent(parseDossierRecord(JSON.parse(raw)));
            } catch {
              return buildDossierCompileContent(DEFAULT_DOSSIER);
            }
          },
          buildDossierCompileContent(DEFAULT_DOSSIER),
        ),
      hierarchyVisibility: "visible",
      icon: File02Icon,
      id: "lunaris.demo.customer-dossier",
      initializeDocument: (document) => {
        const map = document.getMap<string>(DOSSIER_MAP_NAME);
        if (!map.has(DOSSIER_RECORD_KEY)) {
          map.set(DOSSIER_RECORD_KEY, JSON.stringify(DEFAULT_DOSSIER));
        }
      },
      name: "Customer dossier",
      renderer: CustomerDossierRenderer,
      singleton: true,
      statusBar: DossierStatusBar,
      userCreatable: true,
    }),
  ],
});
