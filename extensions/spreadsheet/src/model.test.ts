import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Workbook, initializeWorkbook, cellKey } from "./model";
import { parseFormula, formulaText, copyFormula } from "./formulas";
function pair() {
	const a = new Y.Doc();
	initializeWorkbook(a);
	const b = new Y.Doc();
	Y.applyUpdateV2(b, Y.encodeStateAsUpdateV2(a));
	return [new Workbook(a), new Workbook(b)] as const;
}
function sync(a: Workbook, b: Workbook) {
	const av = Y.encodeStateVector(a.doc);
	const bv = Y.encodeStateVector(b.doc);
	const au = Y.encodeStateAsUpdateV2(a.doc, bv);
	const bu = Y.encodeStateAsUpdateV2(b.doc, av);
	Y.applyUpdateV2(a.doc, bu);
	Y.applyUpdateV2(b.doc, au);
	Y.applyUpdateV2(a.doc, bu);
}
describe("collaborative workbook", () => {
	it("keeps frozen counts inside the remaining grid after structural deletion", () => {
		const [book, other] = pair();
		const sheet = book.list()[0]!;
		book.transact(() => {
			sheet.data.set("freeze", { rows: 5, columns: 5 });
			sheet.remove("rows", 1, 99);
			sheet.remove("columns", 1, 25);
		});
		expect(book.snapshot().sheets[0]!.freeze).toEqual({ rows: 1, columns: 1 });
		book.destroy();
		other.destroy();
	});
	it("copies a surviving range after its original endpoint was deleted", () => {
		const [book, other] = pair();
		const sheet = book.list()[0]!;
		const formula = parseFormula("=SUM(A1:A3)", book, sheet);
		book.transact(() => sheet.remove("rows", 0, 1));
		expect(formulaText(formula, book)).toBe("=SUM(A1:A2)");
		expect(
			formulaText(copyFormula(formula, book, sheet, sheet, 1, 0), book),
		).toBe("=SUM(A2:A3)");
		book.destroy();
		other.destroy();
	});
	it("parses quoted sheet names containing parentheses and brackets", () => {
		const [book, other] = pair();
		const sheet = book.list()[0]!;
		book.addSheet("Budget (FY26) [draft]");
		const source = "=SUM('Budget (FY26) [draft]'!A1:A2)";
		const formula = parseFormula(source, book, sheet);
		expect(formula.unsupported).toBeUndefined();
		expect(formulaText(formula, book)).toBe(source);
		book.destroy();
		other.destroy();
	});
	it("derives unique sheet names after concurrent renames", () => {
		const [a, b] = pair();
		const first = a.list()[0]!;
		a.transact(() => a.addSheet("Other"));
		sync(a, b);
		a.transact(() => first.data.set("name", "Data"));
		b.transact(() => b.list()[1]!.data.set("name", "Data"));
		sync(a, b);
		expect(new Set(a.list().map((sheet) => sheet.name)).size).toBe(2);
		expect(a.snapshot()).toEqual(b.snapshot());
	});
	it("merges overlapping offline pastes despite reordered and duplicate updates", () => {
		const [a, b] = pair();
		const updates: Uint8Array[] = [];
		a.doc.on("updateV2", (update) => updates.push(update));
		a.transact(() => {
			for (let i = 0; i < 10; i++) a.list()[0]!.setInput(i, 0, `A${i}`);
		});
		a.transact(() => a.list()[0]!.insert("columns", 1, 1));
		a.transact(() => a.list()[0]!.setInput(0, 1, "Inserted"));
		b.transact(() => {
			for (let i = 5; i < 15; i++) b.list()[0]!.setInput(i, 0, `B${i}`);
		});
		for (const index of [2, 0, 2, 1, 0])
			Y.applyUpdateV2(b.doc, updates[index]!);
		sync(a, b);
		expect(a.snapshot()).toEqual(b.snapshot());
		expect(a.list()[0]!.input(14, 0)).toBe("B14");
		expect(a.list()[0]!.input(0, 1)).toBe("Inserted");
	});
	it("merges different inputs and formatting independently; converges same-cell edits", () => {
		const [a, b] = pair();
		const sa = a.list()[0]!;
		const sb = b.list()[0]!;
		a.transact(() => {
			sa.setInput(0, 0, "A");
			sa.setInput(1, 0, 123);
		});
		b.transact(() => {
			sb.setInput(0, 0, "B");
			sb.setInput(0, 1, true);
			sb.styles.set(
				cellKey(sb.axis("rows").active[0]!, sb.axis("columns").active[0]!),
				{ bold: true },
			);
		});
		sync(a, b);
		expect(a.snapshot()).toEqual(b.snapshot());
		expect(sa.input(1, 0)).toBe(123);
		expect(sa.input(0, 1)).toBe(true);
		expect(sa.styles.size).toBe(1);
	});
	it("keeps references attached to identities after concurrent insertion and edits", () => {
		const [a, b] = pair();
		const sa = a.list()[0]!;
		const sb = b.list()[0]!;
		a.transact(() =>
			sa.setInput(0, 1, parseFormula("=SUM(A1:A3)+$A$2", a, sa)),
		);
		sync(a, b);
		a.transact(() => sa.insert("rows", 1, 2));
		b.transact(() => sb.setInput(1, 0, 9));
		sync(a, b);
		expect(a.snapshot()).toEqual(b.snapshot());
		expect(
			formulaText(sa.input(0, 1) as ReturnType<typeof parseFormula>, a),
		).toBe("=SUM(A1:A5)+$A$4");
		expect(sa.input(3, 0)).toBe(9);
	});
	it("shrinks ranges on endpoint deletion, hides edits to deleted rows, and rejects deleted single references", () => {
		const [a, b] = pair();
		const sa = a.list()[0]!;
		const sb = b.list()[0]!;
		const formula = parseFormula("=SUM(A1:A3)+A1", a, sa);
		a.transact(() => sa.remove("rows", 0, 1));
		b.transact(() => sb.setInput(0, 0, 7));
		sync(a, b);
		expect(formulaText(formula, a)).toBe("=SUM(A1:A2)+#REF!");
		expect(sa.input(0, 0)).toBeUndefined();
		expect(a.snapshot()).toEqual(b.snapshot());
	});
	it("undoes local changes without undoing remote changes", () => {
		const [a, b] = pair();
		const sa = a.list()[0]!;
		const sb = b.list()[0]!;
		a.transact(() => sa.setInput(0, 0, 1));
		b.transact(() => sb.setInput(0, 1, 2));
		sync(a, b);
		a.undo.undo();
		sync(a, b);
		expect(sa.input(0, 0)).toBeUndefined();
		expect(sa.input(0, 1)).toBe(2);
	});
	it("renames sheets without breaking formulas and preserves absolute references when copying", () => {
		const [a] = pair();
		const source = a.list()[0]!;
		const other = a.addSheet("Other sheet");
		const formula = parseFormula("='Other sheet'!$A1+B$2+\"A1\"", a, source);
		expect(formula.unsupported).toBeUndefined();
		other.data.set("name", "Renamed");
		expect(formulaText(copyFormula(formula, a, source, source, 2, 2), a)).toBe(
			"='Renamed'!$A3+D$2+\"A1\"",
		);
		a.deleteSheet(other.id);
		expect(formulaText(formula, a)).toContain("#REF!");
	});
	it("preserves but marks unsupported formula source", () => {
		const [a] = pair();
		const s = a.list()[0]!;
		expect(parseFormula('=INDIRECT("A1")', a, s).unsupported).toContain(
			"INDIRECT",
		);
		expect(parseFormula("=SUM(A1:A5)", a, s).unsupported).toBeUndefined();
		expect(parseFormula("=MyRange+1", a, s).unsupported).toBeTruthy();
		a.addSheet("Other");
		expect(
			parseFormula("=Sheet1!A1+Other!A1", a, s).unsupported,
		).toBeUndefined();
		expect(parseFormula("=#REF!+1", a, s).unsupported).toBeUndefined();
	});
});
