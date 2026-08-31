import { exportToBlob } from "@excalidraw/excalidraw";
import {
	exporterRepresentations,
	type ExporterRepresentation,
	type ExportResourceSnapshot,
} from "@lunarisapp/exporter";
import { yjsToExcalidraw } from "y-excalidraw";
import { applyUpdateV2, Doc, type Map as YMap } from "yjs";
import { yjsAssetsToFiles } from "./yjs-assets";

const DEFAULT_EXPORT_WIDTH = 800;

function decode(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("Could not read drawing export"));
		reader.onloadend = () => resolve(String(reader.result));
		reader.readAsDataURL(blob);
	});
}

async function exportDrawing(snapshot: ExportResourceSnapshot) {
	const document = new Doc();
	try {
		for (const update of snapshot.yjsUpdates.content ?? []) applyUpdateV2(document, decode(update));
		const elements = yjsToExcalidraw(document.getArray<YMap<unknown>>("elements")).filter((element) => !element.isDeleted);
		if (!elements.length) return { blocks: [], title: snapshot.resource.name ?? "Untitled", version: 1 as const };
		const blob = await exportToBlob({
			appState: { exportBackground: true, exportWithDarkMode: false, viewBackgroundColor: "#ffffff" },
			elements,
			files: yjsAssetsToFiles(document.getMap("assets")),
			maxWidthOrHeight: DEFAULT_EXPORT_WIDTH,
		});
		return {
			blocks: [{ source: await blobToDataUrl(blob), type: "image" as const }],
			title: snapshot.resource.name ?? "Untitled",
			version: 1 as const,
		};
	} finally {
		document.destroy();
	}
}

export const excalidrawExporterRepresentation: ExporterRepresentation = {
	id: "lunaris.excalidraw.exporter",
	invoke: exportDrawing,
	metadata: { label: "Excalidraw", resourceTypeIds: ["lunaris.excalidraw"] },
};

export { exporterRepresentations as excalidrawExporterRepresentations };
