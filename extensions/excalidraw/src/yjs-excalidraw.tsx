import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExcalidrawBinding, yjsToExcalidraw } from "y-excalidraw";
import { Awareness } from "y-protocols/awareness.js";
import { type Doc, type Map as YMap, UndoManager } from "yjs";
import { ExcalidrawEditor } from "./excalidraw";
import { excalidrawLanguage } from "./locale";
import { yjsAssetsToFiles } from "./yjs-assets";

export function YjsExcalidraw({
	locale,
	readOnly = false,
	theme,
	yDoc,
}: {
	locale: string;
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
