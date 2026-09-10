import { expect, it } from "vitest";
import * as Y from "yjs";
import { Workbook, initializeWorkbook, cellKey } from "./model";
it("merges sparse overrides on immutable imported blocks and updates budgets through undo", () => {
	const doc = new Y.Doc();
	initializeWorkbook(doc);
	let book = new Workbook(doc);
	book.transact(() => {
		book.list()[0]!.setInput(0, 0, "001");
		book.list()[0]!.setInput(1, 0, 42);
	});
	const snapshot = book.snapshot();
	book.destroy();
	doc.destroy();
	const a = new Y.Doc();
	initializeWorkbook(a, snapshot);
	const b = new Y.Doc();
	Y.applyUpdateV2(b, Y.encodeStateAsUpdateV2(a));
	book = new Workbook(a);
	const other = new Workbook(b);
	const sheet = book.list()[0]!;
	expect(sheet.inputs.size).toBe(2);
	expect(sheet.inputs.textBytes).toBe(5);
	book.transact(() => sheet.setInput(0, 0, null));
	other.transact(() => other.list()[0]!.setInput(1, 0, "remote"));
	Y.applyUpdateV2(a, Y.encodeStateAsUpdateV2(b, Y.encodeStateVector(a)));
	expect(sheet.inputs.size).toBe(1);
	expect(sheet.inputs.textBytes).toBe(6);
	book.undo.undo();
	expect(sheet.input(0, 0)).toBe("001");
	expect(sheet.input(1, 0)).toBe("remote");
	expect(sheet.inputs.size).toBe(2);
	expect(sheet.inputs.textBytes).toBe(9);
	expect(
		sheet.inputs.get(
			cellKey(snapshot.sheets[0]!.rows[0]!, snapshot.sheets[0]!.columns[0]!),
		),
	).toBe("001");
	book.destroy();
	other.destroy();
	a.destroy();
	b.destroy();
});
