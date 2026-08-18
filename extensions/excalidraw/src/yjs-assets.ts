import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { Map as YMap } from "yjs";

export function yjsAssetsToFiles(yAssets: YMap<unknown>): BinaryFiles {
	return Object.fromEntries(yAssets.entries()) as BinaryFiles;
}
