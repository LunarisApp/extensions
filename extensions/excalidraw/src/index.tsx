import { exportToBlob } from "@excalidraw/excalidraw";
import type { CompileContent, PluginCompileContext } from "@lunarisapp/plugin-sdk";
import {
	ContentRendererReady,
	defineExternalContentType,
	defineExternalPlugin,
	useLocale,
	useWorkspaceAccess,
} from "@lunarisapp/plugin-sdk";
import { withYjsDoc } from "@lunarisapp/plugin-sdk/compile";
import {
	useCurrentProjectYjsDocument,
	useYArray,
} from "@lunarisapp/plugin-sdk/data";
import { useSyncExternalStore } from "react";
import { yjsToExcalidraw } from "y-excalidraw";
import type { Doc, Map as YMap } from "yjs";
import manifest from "../manifest.json";
import { EXCALIDRAW_EXTENSION_ID } from "./constants";
import { ExcalidrawSkeleton } from "./excalidraw-skeleton";
import { excalidrawExtensionIcon } from "./icon";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import "./styles.css";
import { yjsAssetsToFiles } from "./yjs-assets";
import { YjsExcalidraw } from "./yjs-excalidraw";

const DEFAULT_EXPORT_WIDTH = 800;

function subscribeToColorScheme(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributeFilter: ["style"],
		attributes: true,
	});
	return () => observer.disconnect();
}

function currentColorScheme(): "dark" | "light" {
	return document.documentElement.style.colorScheme === "dark" ? "dark" : "light";
}

function useColorScheme(): "dark" | "light" {
	return useSyncExternalStore(
		subscribeToColorScheme,
		currentColorScheme,
		() => "light",
	);
}

async function getExcalidrawCompileContent(
	documentId: string,
	context: PluginCompileContext,
): Promise<CompileContent> {
	const scene = await withYjsDoc(
		context,
		documentId,
		(doc) => ({
			elements: yjsToExcalidraw(doc.getArray<YMap<unknown>>("elements")),
			files: yjsAssetsToFiles(doc.getMap("assets")),
		}),
		{ elements: [] as ReturnType<typeof yjsToExcalidraw>, files: {} },
	);
	const visibleElements = scene.elements.filter((element) => !element.isDeleted);
	if (visibleElements.length === 0) return { sections: [], title: "" };

	const blob = await exportToBlob({
		appState: {
			exportBackground: true,
			exportWithDarkMode: false,
			viewBackgroundColor: "#ffffff",
		},
		elements: visibleElements,
		files: scene.files,
		maxWidthOrHeight: DEFAULT_EXPORT_WIDTH,
	});
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("Could not read drawing export"));
		reader.onloadend = () => resolve(String(reader.result));
		reader.readAsDataURL(blob);
	});
	const dimensions = await new Promise<{ height: number; width: number }>(
		(resolve, reject) => {
			const image = new Image();
			image.onerror = () => reject(new Error("Could not measure drawing export"));
			image.onload = () => resolve({ height: image.height, width: image.width });
			image.src = dataUrl;
		},
	);
	return {
		sections: [{ dataUrl, type: "image", ...dimensions }],
		title: "",
	};
}

function ExcalidrawState({
	description,
	title,
}: {
	description?: string;
	title: string;
}) {
	return (
		<div className="excalidraw-state" role="alert">
			<div className="excalidraw-state__content">
				<h2 className="excalidraw-state__title">{title}</h2>
				{description ? (
					<p className="excalidraw-state__description">{description}</p>
				) : null}
			</div>
		</div>
	);
}

export function ExcalidrawView({
	documentId,
	reportReady,
}: {
	documentId: string;
	reportReady?: () => void;
}) {
	const { error, isLoading, yDoc } = useCurrentProjectYjsDocument(documentId);
	const { canWriteContent } = useWorkspaceAccess();
	const { locale } = useLocale();
	const theme = useColorScheme();

	if (error) {
		return <ExcalidrawState description={error.message} title="Error loading Excalidraw" />;
	}
	if (isLoading) return <ExcalidrawSkeleton />;
	if (!yDoc) {
		return (
			<ExcalidrawState
				description="The Excalidraw document does not exist or has been deleted."
				title="Excalidraw not found"
			/>
		);
	}

	return (
		<ContentRendererReady reportReady={reportReady}>
			<div className="excalidraw-shell">
				<YjsExcalidraw
					key={documentId}
					locale={locale}
					readOnly={!canWriteContent}
					theme={theme}
					yDoc={yDoc}
				/>
			</div>
		</ContentRendererReady>
	);
}

function ExcalidrawElementsCount({ yDoc }: { yDoc: Doc }) {
	useYArray(yDoc, "elements", { deep: true });
	const count = yjsToExcalidraw(yDoc.getArray<YMap<unknown>>("elements")).filter(
		(element) => !element.isDeleted,
	).length;
	return <span>{`${count} ${count === 1 ? "element" : "elements"}`}</span>;
}

function ExcalidrawStatusBar({ documentId }: { documentId: string }) {
	const { isLoading, yDoc } = useCurrentProjectYjsDocument(documentId);
	if ((isLoading && !yDoc) || !yDoc) return null;
	return <ExcalidrawElementsCount yDoc={yDoc} />;
}

export const excalidrawContentType = defineExternalContentType({
	compilable: true,
	createLabel: "Excalidraw",
	documentStorage: "yjs",
	getCompileContent: getExcalidrawCompileContent,
	icon: excalidrawExtensionIcon,
	id: EXCALIDRAW_EXTENSION_ID,
	name: "Excalidraw",
	renderer: ({ documentId, reportReady }) =>
		documentId ? (
			<ExcalidrawView documentId={documentId} reportReady={reportReady} />
		) : (
			<ExcalidrawState title="Document ID not provided" />
		),
	statusBar: ({ documentId }) =>
		documentId ? <ExcalidrawStatusBar documentId={documentId} /> : null,
});

export const excalidrawExtension = defineExternalPlugin({
	locales: { de, en, es, fr, "pt-BR": ptBR },
	manifest,
	modifications: [excalidrawContentType],
});

export default excalidrawExtension;
