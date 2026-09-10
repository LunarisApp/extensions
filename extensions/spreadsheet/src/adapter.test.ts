import { describe, expect, it } from "vitest";
import {
	CommandType,
	CellValueType,
	type ICellData,
	type ICommandInfo,
	type IExecutionOptions,
} from "@univerjs/core";
import * as Y from "yjs";
import { SpreadsheetAdapter } from "./adapter";
import type { Engine } from "./engine";
import { initializeWorkbook, Workbook } from "./model";
import { formulaText, parseFormula } from "./formulas";

function setup(readOnly = false) {
	const doc = new Y.Doc();
	initializeWorkbook(doc);
	let before: (command: ICommandInfo, options?: IExecutionOptions) => void;
	let after: typeof before;
	let sheetId = "";
	const cells: Record<string, ICellData> = {};
	const view = {
		getSheetId: () => sheetId,
		getSheet: () => ({
			getCellRaw: (r: number, c: number) => cells[`${r}/${c}`],
		}),
	};
	const workbook = {
		getActiveSheet: () => view,
		getSheetBySheetId: () => view,
		getWorkbook: () => ({
			getStyles: () => ({ getStyleByCell: (cell?: ICellData) => cell?.s }),
		}),
		setEditable() {},
		setActiveSheet() {},
	};
	const api = {
		getActiveWorkbook: () => workbook,
		disposeUnit() {},
		createWorkbook: (snapshot: { sheetOrder: string[] }) => {
			sheetId = snapshot.sheetOrder[0]!;
			return workbook;
		},
		onBeforeCommandExecute: (fn: typeof before) => {
			before = fn;
			return { dispose() {} };
		},
		onCommandExecuted: (fn: typeof after) => {
			after = fn;
			return { dispose() {} };
		},
		syncExecuteCommand() {},
	};
	const errors: string[] = [];
	const adapter = new SpreadsheetAdapter(
		{ univerAPI: api } as unknown as Engine,
		doc,
		readOnly,
		(error) => errors.push(error),
	);
	const mutation = (
		name: string,
		params: object,
		options?: IExecutionOptions,
	) => {
		const command = {
			id: `sheet.mutation.${name}`,
			type: CommandType.MUTATION,
			params: { subUnitId: sheetId, ...params },
		};
		before(command, options);
		after(command, options);
	};
	return {
		adapter,
		cells,
		errors,
		mutation,
		before: (command: ICommandInfo) => before(command),
	};
}
describe("Univer command adapter", () => {
	it("preserves numeric boolean payloads as typed booleans", () => {
		const { adapter, cells, mutation } = setup();
		cells["0/0"] = { v: 1, t: CellValueType.BOOLEAN };
		mutation("set-range-values", { cellValue: { 0: { 0: cells["0/0"] } } });
		expect(adapter.book.list()[0]!.input(0, 0)).toBe(true);
		cells["0/0"] = { v: 0, t: CellValueType.BOOLEAN };
		mutation("set-range-values", { cellValue: { 0: { 0: cells["0/0"] } } });
		expect(adapter.book.list()[0]!.input(0, 0)).toBe(false);
		adapter.dispose();
	});
	it("sorts a shared range with relative formulas and restores it with one undo", async () => {
		const { adapter, mutation } = setup();
		const sheet = adapter.book.list()[0]!;
		adapter.book.transact(() => {
			sheet.setInput(0, 0, 10);
			sheet.setInput(1, 0, 20);
			sheet.setInput(1, 1, parseFormula("=A2", adapter.book, sheet));
		});
		await Promise.resolve();
		adapter.book.undo.clear();
		const original = adapter.book.snapshot();
		mutation("reorder-range", {
			range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 },
			order: { 0: 1, 1: 0 },
		});
		expect([sheet.input(0, 0), sheet.input(1, 0)]).toEqual([20, 10]);
		expect(
			formulaText(
				sheet.input(0, 1) as ReturnType<typeof parseFormula>,
				adapter.book,
			),
		).toBe("=A1");
		adapter.book.undo.undo();
		expect(adapter.book.snapshot()).toEqual(original);
		adapter.dispose();
	});
	it("recovers empty axes after concurrent deletions without resurrecting hidden values", async () => {
		const { adapter } = setup();
		const doc = new Y.Doc();
		Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(adapter.book.doc));
		const remote = new Workbook(doc);
		const sheet = adapter.book.list()[0]!;
		adapter.book.transact(() => {
			sheet.setInput(0, 0, "deleted");
			sheet.remove("rows", 0, 50);
		});
		remote.transact(() => remote.list()[0]!.remove("rows", 50, 50));
		Y.applyUpdateV2(adapter.book.doc, Y.encodeStateAsUpdateV2(doc));
		await Promise.resolve();
		expect(sheet.axis("rows").active).toHaveLength(0);
		adapter.addBlankGrid();
		await Promise.resolve();
		expect(sheet.axis("rows").active).toHaveLength(1);
		expect(sheet.input(0, 0)).toBeUndefined();
		adapter.dispose();
		remote.destroy();
		doc.destroy();
	});
	it("keeps style-only mutations independent of formula input", async () => {
		const { adapter, cells, mutation } = setup();
		const sheet = adapter.book.list()[0]!;
		cells["0/0"] = { f: "=SUM(B1:B3)", v: 0 };
		mutation("set-range-values", {
			cellValue: { 0: { 0: { f: "=SUM(B1:B3)" } } },
		});
		await Promise.resolve();
		cells["0/0"] = { ...cells["0/0"], s: { bl: 1 } };
		mutation("set-range-values", { cellValue: { 0: { 0: { s: { bl: 1 } } } } });
		expect(
			formulaText(
				sheet.input(0, 0) as ReturnType<typeof parseFormula>,
				adapter.book,
			),
		).toBe("=SUM(B1:B3)");
		expect([...sheet.styles.values()]).toEqual([{ bold: true }]);
		adapter.dispose();
	});
	it("persists number formats and local freeze mutations", async () => {
		const { adapter, mutation } = setup();
		const sheet = adapter.book.list()[0]!;
		mutation("set.numfmt", {
			values: {
				1: {
					ranges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }],
				},
			},
			refMap: { 1: { pattern: "yyyy-mm-dd" } },
		});
		expect([...sheet.styles.values()]).toEqual([
			{ numberFormat: "yyyy-mm-dd" },
		]);
		await Promise.resolve();
		mutation("set-frozen", { xSplit: 1, ySplit: 2 }, { onlyLocal: true });
		expect(sheet.freeze).toEqual({ rows: 2, columns: 1 });
		adapter.dispose();
	});
	it("ignores positional formula rewrites after identity-based insertions", async () => {
		const { adapter, mutation } = setup();
		const sheet = adapter.book.list()[0]!;
		adapter.book.transact(() =>
			sheet.setInput(0, 1, parseFormula("=A2", adapter.book, sheet)),
		);
		await Promise.resolve();
		mutation("insert-row", {
			range: { startRow: 1, endRow: 1, startColumn: 0, endColumn: 25 },
		});
		mutation("set-range-values", {
			cellValue: { 0: { 1: { f: "=A3" } } },
			trigger: "sheet.command.insert-row",
		});
		expect(
			formulaText(
				sheet.input(0, 1) as ReturnType<typeof parseFormula>,
				adapter.book,
			),
		).toBe("=A3");
		adapter.dispose();
	});
	it("rejects read-only durable mutations before execution", () => {
		const { adapter, mutation, errors } = setup(true);
		expect(() =>
			mutation("set-range-values", { cellValue: { 0: { 0: { v: 1 } } } }),
		).toThrow("Canceled");
		expect(errors).toEqual(["This workbook is read-only."]);
		expect(adapter.book.list()[0]!.input(0, 0)).toBeUndefined();
		adapter.dispose();
	});
});
