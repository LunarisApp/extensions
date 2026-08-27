import { exportToBlob } from "@excalidraw/excalidraw";
import type { CompileContent, PluginCompileContext } from "@lunarisapp/plugin-sdk";
import { withYjsDoc } from "@lunarisapp/plugin-sdk/compile";
import { yjsToExcalidraw } from "y-excalidraw";
import type { Map as YMap } from "yjs";
import { yjsAssetsToFiles } from "./yjs-assets";

const DEFAULT_EXPORT_WIDTH = 800;

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error("Could not read drawing export"));
		reader.onloadend = () => resolve(String(reader.result));
		reader.readAsDataURL(blob);
	});
}

function measureImage(dataUrl: string): Promise<{ height: number; width: number }> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onerror = () => reject(new Error("Could not measure drawing export"));
		image.onload = () => resolve({ height: image.height, width: image.width });
		image.src = dataUrl;
	});
}

export async function getExcalidrawCompileContent(
	resourceId: string,
	context: PluginCompileContext,
): Promise<CompileContent> {
	const resource = await context.getProjectResource(resourceId);
	const content = resource?.storage.content;
	if (content?.kind !== "yjs") return { sections: [], title: "" };
	const scene = await withYjsDoc(
		context,
		content,
		(doc) => ({
			elements: yjsToExcalidraw(doc.getArray<YMap<unknown>>("elements")),
			files: yjsAssetsToFiles(doc.getMap("assets")),
		}),
		{ elements: [] as ReturnType<typeof yjsToExcalidraw>, files: {} },
	);
	const elements = scene.elements.filter((element) => !element.isDeleted);
	if (elements.length === 0) return { sections: [], title: "" };

	const blob = await exportToBlob({
		appState: {
			exportBackground: true,
			exportWithDarkMode: false,
			viewBackgroundColor: "#ffffff",
		},
		elements,
		files: scene.files,
		maxWidthOrHeight: DEFAULT_EXPORT_WIDTH,
	});
	const dataUrl = await blobToDataUrl(blob);
	const dimensions = await measureImage(dataUrl);

	return {
		sections: [{ dataUrl, type: "image", ...dimensions }],
		title: "",
	};
}
