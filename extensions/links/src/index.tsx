/*
THESIS: A project link is durable content, not a disposable bookmark or a miniature browser dashboard.
OWN-WORLD: Lunaris host neutrals, one compact address strip, restrained link-blue focus, and native panel controls.
STORY: Attach a web address, save it beside project content, and reopen it in a separate panel.
FIRST VIEWPORT: A direct two-field attachment form; saved items resolve to one labeled destination and one primary open action.
FORM: Host-inherited content item extension; no new visual-world seed required.
*/
import {
  defineExternalContentType,
  defineExternalPlugin,
  withYjsDoc,
} from "@lunarisapp/plugin-sdk";
import { Link01Icon } from "@lunarisapp/ui/icons";
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
} from "./link-viewer";
import "./styles.css";

export const linksContentType = defineExternalContentType({
  actions: [
    {
      icon: Link01Icon,
      id: "open-in-panel",
      labelKey: "linksExtension.link.openInPanel",
      onClick: async (context) => {
        if (!context.documentId) return;
        await context.waitForDocumentPersistence?.();
        const record = await withYjsDoc(
          context.compileContext,
          context.documentId,
          (document) => {
            const raw = document
              .getMap<string>(LINKS_MAP_NAME)
              .get(LINK_RECORD_KEY);
            if (!raw) return DEFAULT_LINK_RECORD;
            try {
              return parseLinkRecord(JSON.parse(raw));
            } catch {
              return DEFAULT_LINK_RECORD;
            }
          },
          DEFAULT_LINK_RECORD,
        );
        if (!record.url) return;
        context.openRightDockPanel({
          params: { title: record.label, url: record.url },
          pluginId: LINKS_EXTENSION_ID,
          renderer: LINKS_BROWSER_RENDERER,
          titleKey: "linksExtension.link.browserTitle",
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
  renderer: LinkRenderer,
});

export default defineExternalPlugin({
  locales: { en },
  manifest,
  modifications: [linksContentType],
  renderers: {
    [LINKS_BROWSER_RENDERER]: ({ params }) => <BrowserPanel params={params} />,
  },
});
