import * as Y from "yjs";
import { Workbook, initializeWorkbook, type WorkbookSnapshot } from "./model";
import { assertWorkbook } from "./validation";
import { LIMITS } from "./limits";

/** Internal import transport, not a portable file format. Build the sparse Yjs
 * base in the conversion worker so the UI and control frame never clone 2M cells. */
export function encodeWorkbookTransfer(
	snapshot: WorkbookSnapshot,
	releaseInputs = false,
): string {
	const doc = new Y.Doc();
	try {
		initializeWorkbook(doc, snapshot);
		// The conversion worker owns its parsed snapshot. Drop its decoded cell
		// graph before allocating the wire update and base64 representation.
		if (releaseInputs) for (const sheet of snapshot.sheets) sheet.inputs = {};
		const bytes = Y.encodeStateAsUpdateV2(doc);
		if (bytes.length > LIMITS.exportBytes)
			throw new Error("Prepared workbook exceeds 256 MiB.");
		const native = bytes as Uint8Array & { toBase64?: () => string };
		if (native.toBase64) return native.toBase64();
		const parts: string[] = [];
		// A multiple of three keeps padding confined to the last base64 segment.
		for (let offset = 0; offset < bytes.length; offset += 49152)
			parts.push(
				btoa(String.fromCharCode(...bytes.subarray(offset, offset + 49152))),
			);
		return parts.join("");
	} finally {
		doc.destroy();
	}
}

export function initializeWorkbookTransfer(
	target: Y.Doc,
	encoded: string,
): void {
	if (encoded.length > Math.ceil(LIMITS.exportBytes / 3) * 4)
		throw new Error("Prepared workbook exceeds 256 MiB.");
	const native = Uint8Array as typeof Uint8Array & {
		fromBase64?: (value: string) => Uint8Array;
	};
	let bytes: Uint8Array;
	if (native.fromBase64) bytes = native.fromBase64(encoded);
	else {
		const binary = atob(encoded);
		bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index++)
			bytes[index] = binary.charCodeAt(index);
	}
	const doc = new Y.Doc();
	let book: Workbook | undefined;
	try {
		Y.applyUpdateV2(doc, bytes);
		book = new Workbook(doc);
		if (book.metadata.get("version") !== 1)
			throw new Error("Unsupported workbook storage version.");
		const source = book;
		assertWorkbook(book.snapshot(false), (id) => source.sheet(id)!.inputs);
		Y.applyUpdateV2(target, bytes);
	} finally {
		book?.destroy();
		doc.destroy();
	}
}
