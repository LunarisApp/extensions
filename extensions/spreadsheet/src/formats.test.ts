import { expect, it } from "vitest";
import * as Y from "yjs";
import { importFile, exportFile, parseDelimited } from "./formats";
import { Workbook, initializeWorkbook, cellKey } from "./model";
import { parseFormula, formulaText } from "./formulas";
import * as XLSX from "xlsx";
const bytes = (text: string) => new TextEncoder().encode(text).buffer;
it("imports sparse record keys without expanding every record across all columns", () => {
	const records = Array.from({ length: 1000 }, (_, i) => ({
		[`field${i}`]: i,
	}));
	const result = importFile(bytes(JSON.stringify(records)), "records.json");
	expect(Object.keys(result.workbook.sheets[0]!.inputs)).toHaveLength(2000);
	expect(result.workbook.sheets[0]!.columns).toHaveLength(1000);
	const wide = Object.fromEntries(
		Array.from({ length: 16_385 }, (_, i) => [`f${i}`, 1]),
	);
	expect(() => importFile(bytes(JSON.stringify([wide])), "wide.json")).toThrow(
		"columns",
	);
});
it("rejects sparse export rectangles beyond the byte limit before allocating a dense table", () => {
	const doc = new Y.Doc();
	const book = new Workbook(doc);
	const sheet = book.addSheet("Sparse", 100_000, 16_384);
	sheet.setInput(99_999, 16_383, "edge");
	for (const format of ["csv", "tsv", "json"] as const)
		expect(() => exportFile(book.snapshot(), format)).toThrow("256 MiB");
	book.destroy();
	doc.destroy();
});
it("rejects Excel data beyond the parser row window instead of truncating it", () => {
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(
		workbook,
		{ A100002: { t: "n", v: 42 }, "!ref": "A1:A100002" },
		"Data",
	);
	expect(() =>
		importFile(
			XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
			"large.xlsx",
		),
	).toThrow("Rows");
});
it("imports Excel error cells as errors rather than numeric error codes", () => {
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(
		workbook,
		{ A1: { t: "e", v: 42 }, "!ref": "A1" },
		"Data",
	);
	const result = importFile(
		XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
		"errors.xlsx",
	);
	expect(result.preview[0]![0]).toBe("=#N/A");
});
it("normalizes dates from Excel's 1904 system", () => {
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(
		workbook,
		{ A1: { v: 0, t: "n", z: "yyyy-mm-dd" }, "!ref": "A1" },
		"Dates",
	);
	workbook.Workbook = { WBProps: { date1904: true } };
	const imported = importFile(
		XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
		"dates.xlsx",
	);
	expect(imported.preview[0]![0]).toBe(1462);
	expect(imported.warnings.join(" ")).toContain("1904");
});
it("parses quoted newlines and escaped quotes; rejects malformed input", () => {
	expect(parseDelimited('a,b\r\n"line\none","say ""yes"""', ",")).toEqual([
		["a", "b"],
		["line\none", 'say "yes"'],
	]);
	expect(() => parseDelimited('"oops', ",")).toThrow("Unclosed");
});
it("preserves identifiers, unsafe integers and formula-like CSV text", () => {
	const result = importFile(
		bytes("id,big,formula,number\n00123,9007199254740993,=SUM(A1:A2),42"),
		"test.csv",
	);
	const doc = new Y.Doc();
	initializeWorkbook(doc, result.workbook);
	const book = new Workbook(doc);
	const sheet = book.list()[0]!;
	expect([0, 1, 2, 3].map((c) => sheet.input(1, c))).toEqual([
		"00123",
		"9007199254740993",
		"=SUM(A1:A2)",
		42,
	]);
	const output = exportFile(result.workbook, "csv");
	expect(new TextDecoder().decode(output.bytes)).toContain("'=SUM(A1:A2)");
	book.destroy();
});
it("round-trips native styling and typed cells through XLSX and ODS", () => {
	const input = importFile(
		bytes("name,value\nÅsa,42\nZoë,12.5"),
		"test.csv",
	).workbook;
	const doc = new Y.Doc();
	initializeWorkbook(doc, input);
	const book = new Workbook(doc);
	const sheet = book.list()[0]!;
	book.transact(() => {
		sheet.styles.set(
			cellKey(sheet.axis("rows").active[1]!, sheet.axis("columns").active[1]!),
			{ bold: true, color: "#aabbcc", numberFormat: "0.00" },
		);
		sheet.rowSizes.set(sheet.axis("rows").active[0]!, 32);
		sheet.data.set("freeze", { rows: 1, columns: 1 });
		const other = book.addSheet("Other");
		other.setInput(0, 0, parseFormula("=SUM('Sheet1'!B2:B3)", book, other));
		other.setInput(0, 1, 45351);
		other.styles.set(
			cellKey(other.axis("rows").active[0]!, other.axis("columns").active[1]!),
			{ numberFormat: "yyyy-mm-dd" },
		);
	});
	const workbook = book.snapshot();
	const native = importFile(
		exportFile(workbook, "native").bytes,
		"backup.lunaris.json",
	).workbook;
	expect(native).toEqual(workbook);
	for (const format of ["xlsx", "ods"] as const) {
		const roundtrip = importFile(
			exportFile(workbook, format).bytes,
			`test.${format}`,
		);
		expect(roundtrip.preview[1]?.slice(0, 2)).toEqual(["Åsa", 42]);
		expect(roundtrip.workbook.sheets).toHaveLength(2);
		const imported = new Y.Doc();
		initializeWorkbook(imported, roundtrip.workbook);
		const restored = new Workbook(imported);
		const other = restored.list()[1]!;
		expect(
			formulaText(
				other.input(0, 0) as ReturnType<typeof parseFormula>,
				restored,
			),
		).toBe("=SUM('Sheet1'!B2:B3)");
		expect(other.input(0, 1)).toBe(45351);
		expect(
			[...other.styles.values()].some((s) => s.numberFormat?.includes("yyyy")),
		).toBe(true);
		expect(roundtrip.warnings.length).toBeGreaterThan(0);
		restored.destroy();
		imported.destroy();
	}
	book.destroy();
	doc.destroy();
});
it("rejects excessive decoded dimensions without truncating CSV", () => {
	expect(() =>
		importFile(bytes("x\n".repeat(100_001)), "too-many.csv"),
	).toThrow("100,000 rows");
	expect(() =>
		importFile(bytes(`${",".repeat(16_384)}x`), "too-wide.csv"),
	).toThrow("columns");
});
it("exports JSON records; rejects duplicate headers and unsafe JSON integers", () => {
	const input = importFile(
		bytes('[{"name":"A","value":2}]'),
		"data.json",
	).workbook;
	expect(
		JSON.parse(new TextDecoder().decode(exportFile(input, "json").bytes)),
	).toEqual([{ name: "A", value: 2 }]);
	const duplicate = importFile(bytes("x,x\n1,2"), "data.csv").workbook;
	expect(() => exportFile(duplicate, "json")).toThrow("unique");
	expect(() =>
		importFile(bytes('[{"id":9007199254740993}]'), "data.json"),
	).toThrow("unsafe");
});

it("validates native color lengths before importing formatting", () => {
	const source = importFile(bytes("Label\nValue"), "source.csv").workbook;
	const sheet = source.sheets[0]!;
	const key = cellKey(sheet.rows[0]!, sheet.columns[0]!);
	for (const property of ["color", "background"] as const) {
		for (const color of ["#12345", "#1234567"]) {
			sheet.styles[key] = { [property]: color };
			expect(() => importFile(bytes(JSON.stringify(source)), "test.lunaris.json"))
				.toThrow("Invalid cell color");
		}
		for (const color of ["#abc", "#abcd", "#ABCDEF", "#ABCDEF80"]) {
			sheet.styles[key] = { [property]: color };
			expect(importFile(bytes(JSON.stringify(source)), "test.lunaris.json")
				.workbook.sheets[0]!.styles[key]).toEqual({ [property]: color });
		}
	}
});
