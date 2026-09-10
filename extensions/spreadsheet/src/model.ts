import * as Y from "yjs";
import { CellStore } from "./cell-store";
import { LIMITS, boundedInteger } from "./limits";

export type Scalar = string | number | boolean;
export interface CellReference {
	sheet: string;
	row: string;
	column: string;
	absoluteRow: boolean;
	absoluteColumn: boolean;
}
export interface ReferenceToken {
	reference: CellReference;
	end?: CellReference;
	qualified: boolean;
}
export interface Formula {
	kind: "formula";
	tokens: Array<string | ReferenceToken>;
	unsupported?: string;
}
export type Input = Scalar | Formula;
export interface CellStyle {
	bold?: boolean;
	italic?: boolean;
	color?: string;
	background?: string;
	alignment?: "left" | "center" | "right";
	numberFormat?: string;
}
export interface Axis {
	all: string[];
	active: string[];
	index: Map<string, number>;
	physical: Map<string, number>;
}
export interface SheetSnapshot {
	id: string;
	name: string;
	rows: string[];
	columns: string[];
	deletedRows: string[];
	deletedColumns: string[];
	inputs: Record<string, Input>;
	styles: Record<string, CellStyle>;
	rowSizes: Record<string, number>;
	columnSizes: Record<string, number>;
	freeze: { rows: number; columns: number };
}
export interface WorkbookSnapshot {
	format: "lunaris.spreadsheet";
	version: 1;
	name: string;
	sheets: SheetSnapshot[];
}
export const LOCAL_EDIT = Symbol("spreadsheet-local-edit");
export const IMPORT_ORIGIN = Symbol("spreadsheet-import");
export const cellKey = (row: string, column: string) => `${row}/${column}`;
export const splitCellKey = (key: string): [string, string] =>
	key.split("/") as [string, string];
// getRandomValues is available in opaque-origin workers; randomUUID is not.
const id = () =>
	Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");

export class Sheet {
	private axes = new Map<string, Axis>();
	private baseRowIndex?: Map<string, number>;
	private baseRowPosition(row: string): number | undefined {
		this.baseRowIndex ??= new Map(
			(this.data.get("baseRows") as Y.Array<string>)
				.toArray()
				.map((id, index) => [id, index]),
		);
		return this.baseRowIndex.get(row);
	}
	readonly inputs: CellStore;
	readonly styles: Y.Map<CellStyle>;
	readonly rowSizes: Y.Map<number>;
	readonly columnSizes: Y.Map<number>;
	constructor(
		readonly id: string,
		readonly data: Y.Map<unknown>,
		private resolveName: (name: string) => string = (name) => name,
	) {
		this.inputs = new CellStore(
			data.get("inputs") as Y.Map<Input | null>,
			data.get("base") as Y.Map<Uint8Array>,
			data.get("baseCounts") as Y.Map<number>,
			data.get("baseText") as Y.Map<number>,
			(row) => this.baseRowPosition(row),
		);
		this.styles = data.get("styles") as Y.Map<CellStyle>;
		this.rowSizes = data.get("rowSizes") as Y.Map<number>;
		this.columnSizes = data.get("columnSizes") as Y.Map<number>;
		data.observeDeep(this.invalidate);
	}
	private invalidate = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
		if (events.some((event) => event.target === this.data.get("baseRows")))
			this.baseRowIndex = undefined;
		if (events.some((event) => event.target === this.data.get("base")))
			this.inputs.invalidate();
		for (const name of ["rows", "columns"] as const) {
			if (
				events.some(
					(event) =>
						event.target === this.data.get(name) ||
						event.target === this.data.get(`deleted${name}`),
				)
			) {
				this.axes.delete(name);
			}
		}
	};
	destroy() {
		this.data.unobserveDeep(this.invalidate);
		this.inputs.destroy();
	}
	get name(): string {
		return this.resolveName(this.data.get("name") as string);
	}
	get freeze(): { rows: number; columns: number } {
		const freeze = this.data.get("freeze") as { rows: number; columns: number };
		return {
			rows: Math.min(freeze.rows, this.axis("rows").active.length),
			columns: Math.min(freeze.columns, this.axis("columns").active.length),
		};
	}
	axis(name: "rows" | "columns"): Axis {
		const cached = this.axes.get(name);
		if (cached) return cached;
		const all = (this.data.get(name) as Y.Array<string>).toArray();
		const deleted = this.data.get(`deleted${name}`) as Y.Map<boolean>;
		const active = all.filter((value) => !deleted.get(value));
		const axis = {
			all,
			active,
			index: new Map(active.map((value, i) => [value, i])),
			physical: new Map(all.map((value, i) => [value, i])),
		};
		this.axes.set(name, axis);
		return axis;
	}
	input(row: number, column: number): Input | undefined {
		return this.inputs.get(
			cellKey(
				this.axis("rows").active[row]!,
				this.axis("columns").active[column]!,
			),
		);
	}
	insert(name: "rows" | "columns", at: number, count: number): void {
		const axis = this.axis(name);
		boundedInteger(at, axis.active.length, "Insertion position");
		boundedInteger(
			count,
			(name === "rows" ? LIMITS.rows : LIMITS.columns) - axis.active.length,
			name,
		);
		if (!count) return;
		const prefix = axis.all.length === 0 ? (name === "rows" ? "r" : "c") : id();
		const values = Array.from(
			{ length: count },
			(_, i) => `${prefix}.${i.toString(36)}`,
		);
		(this.data.get(name) as Y.Array<string>).insert(
			at === axis.active.length
				? axis.all.length
				: axis.physical.get(axis.active[at]!)!,
			values,
		);
		this.axes.delete(name);
	}
	remove(name: "rows" | "columns", at: number, count: number): void {
		const axis = this.axis(name);
		boundedInteger(at, axis.active.length, "Deletion position");
		boundedInteger(count, axis.active.length - at, "Deletion count");
		if (count === axis.active.length)
			throw new Error(
				`A sheet must retain at least one ${name === "rows" ? "row" : "column"}.`,
			);
		const deleted = this.data.get(`deleted${name}`) as Y.Map<boolean>;
		for (const key of axis.active.slice(at, at + count)) deleted.set(key, true);
		this.axes.delete(name);
	}
	setInput(row: number, column: number, value: Input | null): void {
		const rowId = this.axis("rows").active[row];
		const colId = this.axis("columns").active[column];
		if (!rowId || !colId) throw new Error("Cell is outside the worksheet.");
		const key = cellKey(rowId, colId);
		if (value === null) this.inputs.delete(key);
		else this.inputs.set(key, value);
	}
	snapshot(includeInputs = true): SheetSnapshot {
		return {
			id: this.id,
			name: this.name,
			rows: this.axis("rows").all,
			columns: this.axis("columns").all,
			deletedRows: [...(this.data.get("deletedrows") as Y.Map<boolean>).keys()],
			deletedColumns: [
				...(this.data.get("deletedcolumns") as Y.Map<boolean>).keys(),
			],
			inputs: includeInputs ? Object.fromEntries(this.inputs) : {},
			styles: Object.fromEntries(this.styles),
			rowSizes: Object.fromEntries(this.rowSizes),
			columnSizes: Object.fromEntries(this.columnSizes),
			freeze: this.freeze,
		};
	}
}

export class Workbook {
	readonly metadata: Y.Map<unknown>;
	readonly order: Y.Array<string>;
	readonly sheets: Y.Map<Y.Map<unknown>>;
	readonly undo: Y.UndoManager;
	private cache = new Map<string, Sheet>();
	constructor(readonly doc: Y.Doc) {
		this.metadata = doc.getMap("workbook");
		this.order = doc.getArray("sheetOrder");
		this.sheets = doc.getMap("sheets");
		this.undo = new Y.UndoManager([this.metadata, this.order, this.sheets], {
			trackedOrigins: new Set([LOCAL_EDIT]),
			captureTimeout: 0,
		});
	}
	destroy(): void {
		this.undo.destroy();
		for (const sheet of this.cache.values()) sheet.destroy();
	}
	transact(action: () => void): void {
		this.doc.transact(action, LOCAL_EDIT);
	}
	get name(): string {
		return (this.metadata.get("name") as string) ?? "Untitled spreadsheet";
	}
	sheet(sheetId: string): Sheet | undefined {
		const data = this.sheets.get(sheetId);
		if (!data || data.get("deleted")) return undefined;
		let sheet = this.cache.get(sheetId);
		if (!sheet || sheet.data !== data) {
			sheet?.destroy();
			sheet = new Sheet(sheetId, data, (name) =>
				this.displayName(sheetId, name),
			);
			this.cache.set(sheetId, sheet);
		}
		return sheet;
	}
	list(): Sheet[] {
		return this.order.toArray().flatMap((key) => this.sheet(key) ?? []);
	}
	private displayName(id: string, fallback: string): string {
		// Concurrent sheet creation/renaming can choose the same label. Derive
		// unique labels in ID order without writing competing rename operations.
		const used = new Set<string>();
		for (const [key, data] of [...this.sheets]
			.filter(([, data]) => !data.get("deleted"))
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
			const base = String(data.get("name"));
			let name = base,
				index = 1;
			while (used.has(name.toLowerCase())) {
				const suffix = ` (${++index})`;
				name = base.slice(0, 31 - suffix.length) + suffix;
			}
			used.add(name.toLowerCase());
			if (key === id) return name;
		}
		return fallback;
	}
	addSheet(name: string, rows = 100, columns = 26, sheetId = id()): Sheet {
		boundedInteger(rows, LIMITS.rows, "Rows");
		boundedInteger(columns, LIMITS.columns, "Columns");
		if (!rows || !columns)
			throw new Error("Sheets require at least one row and column.");
		if (
			!name.trim() ||
			this.list().some(
				(sheet) => sheet.name.toLowerCase() === name.toLowerCase(),
			)
		)
			throw new Error("Sheet names must be nonempty and unique.");
		const data = new Y.Map<unknown>();
		data.set("name", name);
		data.set("freeze", { rows: 0, columns: 0 });
		for (const key of ["rows", "columns", "baseRows"])
			data.set(key, new Y.Array<string>());
		for (const key of [
			"deletedrows",
			"deletedcolumns",
			"inputs",
			"base",
			"baseCounts",
			"baseText",
			"styles",
			"rowSizes",
			"columnSizes",
		])
			data.set(key, new Y.Map());
		this.sheets.set(sheetId, data);
		this.order.push([sheetId]);
		const sheet = this.sheet(sheetId)!;
		sheet.insert("rows", 0, rows);
		sheet.insert("columns", 0, columns);
		return sheet;
	}
	deleteSheet(sheetId: string): void {
		if (this.list().length <= 1)
			throw new Error("A workbook must retain at least one sheet.");
		this.sheet(sheetId)?.data.set("deleted", true);
	}
	snapshot(includeInputs = true): WorkbookSnapshot {
		return {
			format: "lunaris.spreadsheet",
			version: 1,
			name: this.name,
			sheets: this.list().map((sheet) => sheet.snapshot(includeInputs)),
		};
	}
}

export function initializeWorkbook(
	doc: Y.Doc,
	snapshot?: WorkbookSnapshot,
): void {
	const book = new Workbook(doc);
	if (book.metadata.has("version")) {
		book.destroy();
		return;
	}
	doc.transact(() => {
		book.metadata.set("version", 1);
		book.metadata.set("name", snapshot?.name ?? "Untitled spreadsheet");
		if (!snapshot) {
			book.addSheet("Sheet1");
			return;
		}
		for (const source of snapshot.sheets) {
			const sheet = book.addSheet(source.name, 1, 1, source.id);
			for (const name of ["rows", "columns"] as const) {
				const array = sheet.data.get(name) as Y.Array<string>;
				array.delete(0, array.length);
				array.push(source[name]);
			}
			for (const [target, values] of [
				["deletedrows", source.deletedRows],
				["deletedcolumns", source.deletedColumns],
			] as const) {
				const map = sheet.data.get(target) as Y.Map<boolean>;
				for (const key of values) map.set(key, true);
			}
			(sheet.data.get("baseRows") as Y.Array<string>).push(source.rows);
			sheet.inputs.loadBase(source.inputs);
			for (const name of ["styles", "rowSizes", "columnSizes"] as const) {
				const map = sheet.data.get(name) as Y.Map<unknown>;
				for (const [key, value] of Object.entries(source[name]))
					map.set(key, value);
			}
			sheet.data.set("freeze", source.freeze);
		}
	}, IMPORT_ORIGIN);
	book.destroy();
}
