import { expect, it } from "vitest";
import * as Y from "yjs";
import { Workbook, initializeWorkbook, cellKey } from "./model";
import { FormulaGraph } from "./formula-graph";
import { parseFormula } from "./formulas";
it("marks every member of overlapping cycles, including completed DFS branches", () => {
	const doc = new Y.Doc();
	initializeWorkbook(doc);
	const book = new Workbook(doc),
		sheet = book.list()[0]!;
	book.transact(() => {
		sheet.setInput(0, 0, parseFormula("=B1+C1", book, sheet));
		sheet.setInput(0, 1, parseFormula("=A1", book, sheet));
		sheet.setInput(0, 2, parseFormula("=B1", book, sheet));
	});
	const graph = new FormulaGraph(book);
	graph.rebuild();
	expect(graph.cycles().size).toBe(3);
	book.destroy();
	doc.destroy();
});
it("detects self, cross-sheet and range cycles and clears resolved cycles", () => {
	const doc = new Y.Doc();
	initializeWorkbook(doc);
	const book = new Workbook(doc);
	const a = book.list()[0]!,
		b = book.addSheet("Other");
	book.transact(() => {
		a.setInput(0, 0, parseFormula("=SUM(A1:A3)", book, a));
		a.setInput(0, 1, parseFormula("='Other'!A1", book, a));
		b.setInput(0, 0, parseFormula("='Sheet1'!B1", book, b));
		a.setInput(0, 2, parseFormula("=B1+1", book, a));
	});
	const graph = new FormulaGraph(book);
	graph.rebuild();
	expect(graph.cycles().size).toBe(3);
	const key = cellKey(a.axis("rows").active[0]!, a.axis("columns").active[1]!);
	a.setInput(0, 1, 1);
	graph.update(a.id, key, 1);
	expect(graph.cycles().size).toBe(1);
	book.destroy();
	doc.destroy();
});
