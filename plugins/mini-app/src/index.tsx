import {
	defineExternalContentType,
	defineExternalPlugin,
} from "@lunarisapp/plugin-sdk";
import { AppWindowIcon, Download01Icon } from "@lunarisapp/ui/icons";
import manifest from "../plugin.json";
import "./styles.css";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import { MiniAppViewer } from "./mini-app-viewer";

export const MINI_APP_PLUGIN_ID = "lunaris.mini-app";

export const miniAppContentType = defineExternalContentType({
	actions: [
		{
			icon: Download01Icon,
			id: "download-source",
			labelKey: "plugins.miniApp.downloadSource",
			onClick: (context) => {
				if (!context.itemId) return;
				void context.downloadFileAttachment(context.itemId).catch(() => false);
			},
		},
	],
	createLabel: "Mini App",
	documentStorage: "none",
	icon: AppWindowIcon,
	id: MINI_APP_PLUGIN_ID,
	name: "Mini App",
	renderer: ({ itemId, reportReady }) => (
		<MiniAppViewer itemId={itemId} reportReady={reportReady} />
	),
	rendererSandbox: "local-srcdoc",
});

export default defineExternalPlugin({
	locales: { de, en, es, fr, "pt-BR": ptBR },
	manifest,
	modifications: [miniAppContentType],
});
