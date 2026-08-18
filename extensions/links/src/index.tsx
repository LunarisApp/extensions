/*
THESIS: A project link is durable content, not a disposable bookmark or a miniature browser dashboard.
OWN-WORLD: Lunaris host neutrals, one compact address strip, restrained link-blue focus, and native panel controls.
STORY: Attach a web address, save it beside project content, and reopen it by clicking the hierarchy item.
FIRST VIEWPORT: A direct two-field attachment form; saved items load their website immediately and remain editable from item actions.
FORM: Host-inherited content item extension; no new visual-world seed required.
*/
import {
  defineExternalContentType,
  defineExternalPlugin,
  withYjsDoc,
} from "@lunarisapp/plugin-sdk";
import { Link01Icon, PencilEdit01Icon } from "@lunarisapp/ui/icons";
import manifest from "../manifest.json";
import { BrowserPanel } from "./browser-panel";
import {
  buildLinkCompileContent,
  DEFAULT_LINK_RECORD,
  LINK_RECORD_KEY,
  LINKS_MAP_NAME,
  parseLinkRecord,
} from "./domain";
import en from "./locales/en.json";
import {
  LinkRenderer,
  LINKS_BROWSER_RENDERER,
  LINKS_EXTENSION_ID,
  LINKS_MANAGER_RENDERER,
  LinkWebsiteRenderer,
} from "./link-viewer";
import "./styles.css";

export const linksContentType = defineExternalContentType({
  actions: [
    {
      icon: PencilEdit01Icon,
      id: "edit-link",
      labelKey: "linksExtension.link.edit",
      onClick: (context) => {
        if (!context.documentId) return;
        context.openRightDockPanel({
          params: {
            documentId: context.documentId,
            ...(context.itemId ? { itemId: context.itemId } : {}),
          },
          pluginId: LINKS_EXTENSION_ID,
          renderer: LINKS_MANAGER_RENDERER,
          titleKey: "linksExtension.link.editTitle",
        });
      },
    },
  ],
  compilable: true,
  createLabel: "Link",
  documentStorage: "yjs",
  getCompileContent: (documentId, context) =>
    withYjsDoc(
      context,
      documentId,
      (document) => {
        const raw = document
          .getMap<string>(LINKS_MAP_NAME)
          .get(LINK_RECORD_KEY);
        if (!raw) return buildLinkCompileContent(DEFAULT_LINK_RECORD);
        try {
          return buildLinkCompileContent(parseLinkRecord(JSON.parse(raw)));
        } catch {
          return buildLinkCompileContent(DEFAULT_LINK_RECORD);
        }
      },
      buildLinkCompileContent(DEFAULT_LINK_RECORD),
    ),
  icon: Link01Icon,
  id: LINKS_EXTENSION_ID,
  initializeDocument: (document) => {
    const map = document.getMap<string>(LINKS_MAP_NAME);
    if (!map.has(LINK_RECORD_KEY)) {
      map.set(LINK_RECORD_KEY, JSON.stringify(DEFAULT_LINK_RECORD));
    }
  },
  name: "Link",
  renderer: LinkWebsiteRenderer,
});

export default defineExternalPlugin({
  locales: { en },
  manifest,
  modifications: [linksContentType],
  renderers: {
    [LINKS_BROWSER_RENDERER]: ({ params }) => <BrowserPanel params={params} />,
    [LINKS_MANAGER_RENDERER]: ({ params }) => (
      <LinkRenderer
        documentId={
          typeof params.documentId === "string" ? params.documentId : undefined
        }
        itemId={typeof params.itemId === "string" ? params.itemId : undefined}
        params={params}
      />
    ),
  },
});
