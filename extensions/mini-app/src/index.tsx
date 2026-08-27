import type { ResourceCommandContext, ResourceViewProps } from "@lunarisapp/plugin-sdk";
import { definePlugin } from "@lunarisapp/plugin-sdk";
import { AppWindowIcon, Download01Icon } from "@lunarisapp/ui/icons";
import { z } from "zod";
import manifest from "../manifest.json";
import "./styles.css";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import { MiniAppViewer } from "./mini-app-viewer";

export const MINI_APP_EXTENSION_ID = "lunaris.mini-app";

export const MINI_APP_SCHEMA_ID = "lunaris.mini-app.metadata";

export const miniAppMetadataSchema = z.object({}).strict();

export const miniAppResourceType = {
	defaultViewId: MINI_APP_EXTENSION_ID,
	hierarchy: { userCreatable: true, visible: true },
	icon: AppWindowIcon,
	name: "Mini App",
	resourceTypeId: MINI_APP_EXTENSION_ID,
	schema: {
		currentVersion: 1,
		id: MINI_APP_SCHEMA_ID,
		read: () => ({}),
		versions: { 1: miniAppMetadataSchema },
	},
	storage: { content: { kind: "file" as const } },
};

export const miniAppView = {
	icon: AppWindowIcon,
	name: "Mini App",
	renderer: ({ reportReady, resource, storage }: ResourceViewProps) => {
		const content = storage.content;
		return content?.kind === "file" ? (
			<MiniAppViewer
				resourceId={resource.resourceId}
				reportReady={reportReady}
				storage={content}
			/>
		) : null;
	},
	rendererSandbox: "local-srcdoc" as const,
	storageRequirements: { content: "file" as const },
	target: {
		kind: "resource" as const,
		resourceTypeIds: [MINI_APP_EXTENSION_ID],
		schemas: [{ id: MINI_APP_SCHEMA_ID, minimumVersion: 1, maximumVersion: 1 }],
	},
	viewId: MINI_APP_EXTENSION_ID,
};

export const miniAppCommands = {
	commands: [
		{
			icon: Download01Icon,
			id: "lunaris.mini-app.download-source",
			labelKey: "miniAppExtension.miniApp.downloadSource",
			onExecute: (context: ResourceCommandContext) => {
				const content = context.storage.content;
				if (content?.kind !== "file") return;
				void context.downloadFile(content).catch(() => false);
			},
		},
	],
	id: "lunaris.mini-app.commands",
	resourceTypeIds: [MINI_APP_EXTENSION_ID],
};

export default definePlugin({
	manifest,
	activate({ contributions }) {
		contributions.resourceType(miniAppResourceType);
		contributions.view(miniAppView);
		contributions.command(miniAppCommands);
		contributions.locales({ de, en, es, fr, "pt-BR": ptBR });
	},
});
