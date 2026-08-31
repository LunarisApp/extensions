import {
	type ResourcePayloadContext,
	type ResourceStorageHandle,
	type ResourceViewProps,
	type ResourceViewStatusProps,
	ViewReady,
	definePlugin,
	useLocale,
	useWorkspaceAccess,
} from "@lunarisapp/plugin-sdk";
import {
	useYjsStorage,
	useYArray,
} from "@lunarisapp/plugin-sdk/data";
import { useSyncExternalStore } from "react";
import { yjsToExcalidraw } from "y-excalidraw";
import type { Doc, Map as YMap } from "yjs";
import { z } from "zod";
import manifest from "../manifest.json";
import {
	excalidrawExporterRepresentation,
	excalidrawExporterRepresentations,
} from "./exporter-integration";
import { EXCALIDRAW_EXTENSION_ID } from "./constants";
import { ExcalidrawSkeleton } from "./excalidraw-skeleton";
import { excalidrawExtensionIcon } from "./icon";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";
import { excalidrawSearchIndexer } from "./search-indexer";
import "./styles.css";
import { YjsExcalidraw } from "./yjs-excalidraw";

type YjsStorageHandle = Extract<ResourceStorageHandle, { kind: "yjs" }>;

function subscribeToColorScheme(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributeFilter: ["class", "style"],
		attributes: true,
	});
	const media = window.matchMedia?.("(prefers-color-scheme: dark)");
	media?.addEventListener("change", onChange);
	return () => {
		observer.disconnect();
		media?.removeEventListener("change", onChange);
	};
}

function currentColorScheme(): "dark" | "light" {
	const explicitScheme = document.documentElement.style.colorScheme;
	if (explicitScheme === "dark" || explicitScheme === "light") {
		return explicitScheme;
	}
	if (document.documentElement.classList.contains("dark")) return "dark";
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function useColorScheme(): "dark" | "light" {
	return useSyncExternalStore(
		subscribeToColorScheme,
		currentColorScheme,
		() => "light",
	);
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
	reportReady,
	storage,
}: {
	reportReady?: () => void;
	storage: YjsStorageHandle;
}) {
	const { error, isLoading, yDoc } = useYjsStorage(storage);
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
		<ViewReady reportReady={reportReady}>
			<div className="excalidraw-shell" data-color-scheme={theme}>
				<YjsExcalidraw
					locale={locale}
					readOnly={!canWriteContent}
					theme={theme}
					yDoc={yDoc}
				/>
			</div>
		</ViewReady>
	);
}

function ExcalidrawElementsCount({ yDoc }: { yDoc: Doc }) {
	useYArray(yDoc, "elements", { deep: true });
	const count = yjsToExcalidraw(yDoc.getArray<YMap<unknown>>("elements")).filter(
		(element) => !element.isDeleted,
	).length;
	return (
		<span className="excalidraw-statusbar">
			{`${count} ${count === 1 ? "element" : "elements"}`}
		</span>
	);
}

function ExcalidrawStatusBar({ storage }: ResourceViewStatusProps) {
	const content = storage.content;
	const { yDoc } = useYjsStorage(content?.kind === "yjs" ? content : undefined);
	if (!yDoc) {
		return <span className="excalidraw-statusbar">Excalidraw</span>;
	}
	return <ExcalidrawElementsCount yDoc={yDoc} />;
}

export const EXCALIDRAW_SCHEMA_ID = "lunaris.excalidraw.scene";

export const excalidrawSceneSchema = z.object({
	assets: z.record(z.string(), z.unknown()),
	elements: z.array(z.record(z.string(), z.unknown())),
});

export const excalidrawResourceType = {
	defaultViewId: EXCALIDRAW_EXTENSION_ID,
	hierarchy: { userCreatable: true, visible: true },
	icon: excalidrawExtensionIcon,
	name: "Excalidraw",
	resourceTypeId: EXCALIDRAW_EXTENSION_ID,
	schema: {
		currentVersion: 1,
		id: EXCALIDRAW_SCHEMA_ID,
		read: ({ storage }: ResourcePayloadContext) => {
			const content = storage.content;
			const document = content?.kind === "yjs" ? content.document : undefined;
			return {
				assets: Object.fromEntries(document?.getMap("assets").entries() ?? []),
				elements: document
					? yjsToExcalidraw(document.getArray<YMap<unknown>>("elements"))
					: [],
			};
		},
		versions: { 1: excalidrawSceneSchema },
	},
	storage: { content: { kind: "yjs" as const } },
};

export const excalidrawView = {
	icon: excalidrawExtensionIcon,
	name: "Excalidraw",
	renderer: ({ reportReady, resource, storage }: ResourceViewProps) => {
		const content = storage.content;
		return content?.kind === "yjs" ? (
			<ExcalidrawView
				key={resource.resourceId}
				reportReady={reportReady}
				storage={content}
			/>
		) : (
			<ExcalidrawState title="Drawing storage not provided" />
		);
	},
	statusBar: ExcalidrawStatusBar,
	storageRequirements: { content: "yjs" as const },
	target: {
		kind: "resource" as const,
		resourceTypeIds: [EXCALIDRAW_EXTENSION_ID],
		schemas: [{ id: EXCALIDRAW_SCHEMA_ID, minimumVersion: 1, maximumVersion: 1 }],
	},
	viewId: EXCALIDRAW_EXTENSION_ID,
};

export const excalidrawExtension = definePlugin({
	manifest,
	activate({ contributions, slots }) {
		contributions.resourceType(excalidrawResourceType);
		contributions.view(excalidrawView);
		slots.contribute(excalidrawExporterRepresentations, excalidrawExporterRepresentation);
		contributions.searchIndexer(excalidrawSearchIndexer);
		contributions.locales({ de, en, es, fr, "pt-BR": ptBR });
	},
});

export default excalidrawExtension;
