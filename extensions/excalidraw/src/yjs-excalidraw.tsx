import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { PluginYjsProvider } from "@lunarisapp/plugin-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExcalidrawBinding, yjsToExcalidraw } from "y-excalidraw";
import { Awareness } from "y-protocols/awareness.js";
import { type Doc, type Map as YMap, UndoManager } from "yjs";
import { ExcalidrawEditor } from "./excalidraw";
import { excalidrawLanguage } from "./locale";
import { yjsAssetsToFiles } from "./yjs-assets";

export function YjsExcalidraw({
	locale,
	persistence,
	readOnly = false,
	theme,
	yDoc,
}: {
	locale: string;
	persistence?: PluginYjsProvider | null;
	readOnly?: boolean;
	theme: "dark" | "light";
	yDoc: Doc;
}) {
	const [api, setApi] = useState<ExcalidrawImperativeAPI>();
	const [binding, setBinding] = useState<ExcalidrawBinding>();
	const ref = useRef<HTMLDivElement>(null);
	const yElements = yDoc.getArray<YMap<unknown>>("elements");
	const yAssets = yDoc.getMap("assets");
	const awareness = useMemo(() => new Awareness(yDoc), [yDoc]);
	const initialElements = useMemo(() => yjsToExcalidraw(yElements), [yElements]);
	const initialFiles = useMemo(() => yjsAssetsToFiles(yAssets), [yAssets]);

	useEffect(() => {
		if (!persistence || readOnly) return;

		let dirty = false;
		let flushing = false;
		let stopped = false;
		const flush = async () => {
			if (flushing || stopped) return;
			flushing = true;
			try {
				do {
					dirty = false;
					await persistence.waitForPersistence();
				} while (dirty && !stopped);
			} catch {
				// Closing the sandbox rejects outstanding bridge calls after the host
				// has already received the update. Avoid an unhandled teardown rejection.
			} finally {
				flushing = false;
			}
		};
		const requestFlush = (_update: Uint8Array, origin: unknown) => {
			if (origin === "host") return;
			dirty = true;
			// Let the SDK forward this update to the host before asking it to drain.
			queueMicrotask(() => void flush());
		};

		yDoc.on("updateV2", requestFlush);
		return () => {
			stopped = true;
			yDoc.off("updateV2", requestFlush);
		};
	}, [persistence, readOnly, yDoc]);

	useEffect(
		() => () => {
			awareness.destroy();
		},
		[awareness],
	);

	useEffect(() => {
		if (readOnly || !(api && ref.current)) return;
		const undoManager = new UndoManager(yElements);
		const nextBinding = new ExcalidrawBinding(
			yElements,
			yAssets,
			api,
			awareness,
			{
				excalidrawDom: ref.current,
				undoManager,
			},
		);
		setBinding(nextBinding);
		return () => {
			nextBinding.destroy();
			undoManager.destroy();
			setBinding(undefined);
		};
	}, [api, awareness, readOnly, yAssets, yElements]);

	return (
		<ExcalidrawEditor
			binding={readOnly ? undefined : binding}
			initialData={{ elements: initialElements, files: initialFiles }}
			lang={excalidrawLanguage(locale)}
			onApiReady={setApi}
			readOnly={readOnly}
			ref={ref}
			theme={theme}
		/>
	);
}
