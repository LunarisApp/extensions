import en from "./locales/en.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import { definePlugin, type ResourceViewProps } from "@lunarisapp/plugin-sdk";

import { z } from "zod";
import manifest from "../manifest.json";

import { SpreadsheetEditor } from "./editor";
import { assertWorkbook } from "./validation";
import { initializeWorkbook, Workbook } from "./model";
import { initializeWorkbookTransfer } from "./transfer";
const icon = [
	["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
	["path", { d: "M3 9h18M3 15h18M9 3v18" }],
] as const;
export default definePlugin({
	manifest,
	activate({ contributions }) {
		contributions.locales({ en, de, es, fr, "pt-BR": ptBR });
		contributions.resourceType({
			resourceTypeId: manifest.id,
			name: manifest.name,
			icon,
			defaultViewId: manifest.id,
			storage: {
				content: {
					kind: "yjs",
					initialize: (doc, context) => {
						const encoded = context.initialPayload?.workbookUpdateV1;
						if (typeof encoded === "string") {
							initializeWorkbookTransfer(doc, encoded);
							return;
						}
						const snapshot = context.initialPayload?.workbook;
						if (snapshot !== undefined) {
							assertWorkbook(snapshot);
							initializeWorkbook(doc, snapshot);
						} else initializeWorkbook(doc);
					},
				},
			},
			schema: {
				id: "lunaris.spreadsheet.workbook",
				currentVersion: 1,
				versions: {
					1: z.custom((value) => {
						try {
							assertWorkbook(value);
							return true;
						} catch {
							return false;
						}
					}),
				},
				read: ({ storage }) => {
					const content = storage.content;
					if (content?.kind !== "yjs")
						throw new Error("Workbook storage unavailable.");
					const book = new Workbook(content.document);
					try {
						return book.snapshot();
					} finally {
						book.destroy();
					}
				},
			},
		});
		contributions.view({
			name: manifest.name,
			icon,
			viewId: manifest.id,
			renderer: (props: ResourceViewProps) => (
				<SpreadsheetEditor key={props.resource.resourceId} {...props} />
			),
			target: { kind: "resource", resourceTypeIds: [manifest.id] },
			storageRequirements: { content: "yjs" },
		});
	},
});
