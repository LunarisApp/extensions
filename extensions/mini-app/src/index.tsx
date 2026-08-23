import type { ContentTypeDefinition } from "@lunarisapp/plugin-sdk";
import { definePlugin } from "@lunarisapp/plugin-sdk";
import { AppWindowIcon, Download01Icon } from "@lunarisapp/ui/icons";
import manifest from "../manifest.json";
import "./styles.css";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import { MiniAppViewer } from "./mini-app-viewer";

export const MINI_APP_EXTENSION_ID = "lunaris.mini-app";

export const miniAppContentType: ContentTypeDefinition = {
	actions: [
		{
			icon: Download01Icon,
			id: "download-source",
			labelKey: "miniAppExtension.miniApp.downloadSource",
			onClick: (context) => {
				if (!context.itemId) return;
				void context.fileStorage.download(context.itemId).catch(() => false);
			},
		},
	],
	documentStorage: "none",
	icon: AppWindowIcon,
	id: MINI_APP_EXTENSION_ID,
	name: "Mini App",
	renderer: ({ itemId, reportReady }) => (
		<MiniAppViewer itemId={itemId} reportReady={reportReady} />
	),
	rendererSandbox: "local-srcdoc",
};

export default definePlugin({
	manifest,
	activate({ contributions }) {
		contributions.contentType(miniAppContentType);
		contributions.locales({ de, en, es, fr, "pt-BR": ptBR });
	},
});
