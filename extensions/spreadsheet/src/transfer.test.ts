import { expect, it } from "vitest";
import * as Y from "yjs";
import { Workbook, initializeWorkbook } from "./model";
import { encodeWorkbookTransfer, initializeWorkbookTransfer } from "./transfer";

it("initializes a validated sparse workbook without changing native backup data", () => {
	const source = new Y.Doc(),
		target = new Y.Doc();
	initializeWorkbook(source);
	const book = new Workbook(source);
	book.transact(() => book.list()[0]!.setInput(2, 3, "00123"));
	initializeWorkbookTransfer(target, encodeWorkbookTransfer(book.snapshot()));
	const replica = new Workbook(target);
	expect(replica.snapshot()).toEqual(book.snapshot());
	book.destroy();
	replica.destroy();
	source.destroy();
	target.destroy();
});
it("rejects malformed transfers before modifying the target", () => {
	const target = new Y.Doc();
	expect(() => initializeWorkbookTransfer(target, "invalid!!")).toThrow();
	expect(Y.encodeStateVector(target)).toEqual(new Uint8Array([0]));
	target.destroy();
});
it("can release the worker-owned input graph after preparing the sparse base", () => {
	const doc = new Y.Doc();
	initializeWorkbook(doc);
	const book = new Workbook(doc);
	book.list()[0]!.setInput(0, 0, "kept");
	const snapshot = book.snapshot();
	const encoded = encodeWorkbookTransfer(snapshot, true);
	expect(snapshot.sheets[0]!.inputs).toEqual({});
	const restored = new Y.Doc();
	initializeWorkbookTransfer(restored, encoded);
	const replica = new Workbook(restored);
	expect(replica.list()[0]!.input(0, 0)).toBe("kept");
	book.destroy();
	replica.destroy();
	doc.destroy();
	restored.destroy();
});
