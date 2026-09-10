import { HIDDEN_COMMANDS } from "./commands";
import {
	CommandType,
	CellValueType,
	CanceledError,
	type ICellData,
	type ICommandInfo,
	type IExecutionOptions,
	type IRange,
	type IStyleData,
} from "@univerjs/core";
import type * as Y from "yjs";
import type { Engine } from "./engine";
import { parseFormula, copyFormula } from "./formulas";
import { FormulaGraph } from "./formula-graph";
import { inputBytes } from "./cell-store";
import { LIMITS } from "./limits";
import {
	type CellStyle,
	type Input,
	type Sheet,
	Workbook,
	cellKey,
	splitCellKey,
} from "./model";
import {
	engineCell,
	nativeStyle,
	projectWorkbook,
	UNIT_ID,
} from "./projection";

type Params = {
	subUnitId?: string;
	unitId?: string;
	trigger?: string;
	cellValue?: Record<string, Record<string, ICellData | null>>;
	range?: IRange;
	ranges?: IRange[];
	name?: string;
	sheet?: { id: string; name: string; rowCount: number; columnCount: number };
	rowHeight?: number | Record<number, number>;
	colWidth?: number | Record<number, number>;
	order?: Record<number, number>;
	values?: Record<string, { ranges: IRange[] }>;
	refMap?: Record<string, { pattern: string }>;
	xSplit?: number;
	ySplit?: number;
};
const blocked =
	/(?:merge|move-range|move-rows|move-cols|move-columns|insert-range|delete-range|copy-sheet|defined-name|set-worksheet-(?:background|tab-color|hidden)|hide-row|hide-col)/;
const structural =
	/sheet\.(?:command|mutation)\.(?:insert-(?:row|col)|remove-(?:row|col)|reorder-range)/;
const mappedMutations = new Set(
	[
		"set-range-values",
		"insert-row",
		"insert-col",
		"remove-rows",
		"remove-col",
		"insert-sheet",
		"remove-sheet",
		"set-worksheet-name",
		"set-worksheet-row-height",
		"set-worksheet-col-width",
		"reorder-range",
		"set-frozen",
		"set.numfmt",
		"remove.numfmt",
	].map((s) => `sheet.mutation.${s}`),
);

/** Translates supported semantic mutations into identity-based durable edits. */
export class SpreadsheetAdapter {
	readonly book: Workbook;
	private graph: FormulaGraph;
	private cycles = new Set<string>();
	private applying = false;
	private structuralPending = false;
	private scheduled = false;
	private disposed = false;
	private dirty = new Map<string, Set<string>>();
	private disposables: Array<{ dispose(): void }> = [];
	constructor(
		readonly engine: Engine,
		doc: Y.Doc,
		readonly readOnly: boolean,
		private onError: (message: string) => void,
		private onRecovery: (needed: boolean) => void = () => {},
	) {
		this.book = new Workbook(doc);
		this.graph = new FormulaGraph(this.book);
		this.rebuild();
		this.disposables.push(
			engine.univerAPI.onBeforeCommandExecute(this.before),
			engine.univerAPI.onCommandExecuted(this.executed),
		);
		this.book.sheets.observeDeep(this.changed);
	}
	private before = (
		command: Readonly<ICommandInfo>,
		options?: IExecutionOptions,
	) => {
		if (
			this.applying ||
			(options?.onlyLocal && command.id !== "sheet.mutation.set-frozen") ||
			options?.fromCollab
		)
			return;
		if (
			command.id === "univer.command.undo" ||
			command.id === "univer.command.redo"
		) {
			if (!this.readOnly)
				command.id.endsWith("undo")
					? this.book.undo.undo()
					: this.book.undo.redo();
			throw new CanceledError();
		}
		if (
			command.type === CommandType.COMMAND &&
			(blocked.test(command.id) || HIDDEN_COMMANDS.includes(command.id))
		) {
			this.onError(
				"This operation is not supported in collaborative spreadsheets yet.",
			);
			throw new CanceledError();
		}
		if (
			this.readOnly &&
			command.type === CommandType.MUTATION &&
			mappedMutations.has(command.id)
		) {
			this.onError("This workbook is read-only.");
			throw new CanceledError();
		}
		const params = command.params as Params | undefined;
		const sheet = params?.subUnitId
			? this.book.sheet(params.subUnitId)
			: undefined;
		if (
			command.type === CommandType.MUTATION &&
			sheet &&
			params?.range &&
			/insert-(row|col)$/.test(command.id)
		) {
			const rows = command.id.endsWith("row");
			const count = rows
				? params.range.endRow - params.range.startRow + 1
				: params.range.endColumn - params.range.startColumn + 1;
			if (
				sheet.axis(rows ? "rows" : "columns").active.length + count >
				(rows ? LIMITS.rows : LIMITS.columns)
			) {
				this.onError("Worksheet size limit reached.");
				throw new CanceledError();
			}
		}
	};
	private executed = (
		command: Readonly<ICommandInfo>,
		options?: IExecutionOptions,
	) => {
		if (
			this.applying ||
			this.readOnly ||
			(options?.onlyLocal && command.id !== "sheet.mutation.set-frozen") ||
			options?.fromCollab ||
			command.type !== CommandType.MUTATION
		)
			return;
		if (!mappedMutations.has(command.id)) return;
		const params = command.params as Params;
		try {
			this.book.transact(() => this.applyMutation(command.id, params));
		} catch (error) {
			this.onError(error instanceof Error ? error.message : String(error));
			this.structuralPending = true;
			this.schedule();
		}
	};
	private applyMutation(id: string, p: Params) {
		if (id === "sheet.mutation.insert-sheet" && p.sheet) {
			this.book.addSheet(
				p.sheet.name,
				p.sheet.rowCount,
				p.sheet.columnCount,
				p.sheet.id,
			);
			return;
		}
		const sheet = p.subUnitId ? this.book.sheet(p.subUnitId) : undefined;
		if (!sheet) return;
		if (id === "sheet.mutation.remove-sheet") {
			this.book.deleteSheet(sheet.id);
			return;
		}
		if (id === "sheet.mutation.set-frozen") {
			sheet.data.set("freeze", {
				rows: Math.max(0, p.ySplit ?? 0),
				columns: Math.max(0, p.xSplit ?? 0),
			});
			return;
		}
		if (id === "sheet.mutation.set-worksheet-name") {
			if (
				!p.name?.trim() ||
				this.book
					.list()
					.some(
						(s) =>
							s.id !== sheet.id &&
							s.name.toLowerCase() === p.name!.toLowerCase(),
					)
			)
				throw new Error("Sheet names must be nonempty and unique.");
			sheet.data.set("name", p.name);
			return;
		}
		if (id.endsWith(".numfmt")) {
			const groups = id.includes("remove.")
				? [{ ranges: p.ranges ?? [], pattern: undefined }]
				: Object.entries(p.values ?? {}).map(([id, value]) => ({
						ranges: value.ranges,
						pattern: p.refMap?.[id]?.pattern,
					}));
			for (const group of groups)
				for (const range of group.ranges)
					for (let r = range.startRow; r <= range.endRow; r++)
						for (let c = range.startColumn; c <= range.endColumn; c++) {
							const row = sheet.axis("rows").active[r],
								column = sheet.axis("columns").active[c];
							if (!row || !column) continue;
							const key = cellKey(row, column);
							const style = { ...sheet.styles.get(key) };
							if (group.pattern) style.numberFormat = group.pattern;
							else delete style.numberFormat;
							Object.keys(style).length
								? sheet.styles.set(key, style)
								: sheet.styles.delete(key);
						}
			return;
		}
		if (structural.test(id) && p.range) {
			this.structuralPending = true;
			if (id.endsWith("reorder-range")) {
				this.sort(sheet, p);
				return;
			}
			const rows = /row/.test(id);
			const at = rows ? p.range.startRow : p.range.startColumn;
			const count = (rows ? p.range.endRow : p.range.endColumn) - at + 1;
			if (id.includes("insert-"))
				sheet.insert(rows ? "rows" : "columns", at, count);
			else sheet.remove(rows ? "rows" : "columns", at, count);
			return;
		}
		if (
			id === "sheet.mutation.set-worksheet-row-height" ||
			id === "sheet.mutation.set-worksheet-col-width"
		) {
			const rows = id.includes("row-height");
			const sizes = rows ? sheet.rowSizes : sheet.columnSizes;
			const dimension = sheet.axis(rows ? "rows" : "columns");
			const value = rows ? p.rowHeight : p.colWidth;
			for (const range of p.ranges ?? [])
				for (
					let n = rows ? range.startRow : range.startColumn;
					n <= (rows ? range.endRow : range.endColumn);
					n++
				) {
					const size = typeof value === "number" ? value : value?.[n];
					if (size !== undefined && dimension.active[n])
						sizes.set(dimension.active[n]!, size);
				}
			return;
		}
		if (id === "sheet.mutation.set-range-values" && p.cellValue) {
			// Univer adjusts positional formula strings after structural commands. The
			// canonical reference tokens already follow the edited identities.
			if (this.structuralPending || (p.trigger && structural.test(p.trigger)))
				return;
			const matrix = this.engine.univerAPI
				.getActiveWorkbook()
				?.getSheetBySheetId(sheet.id)
				?.getSheet();
			const styles = this.engine.univerAPI
				.getActiveWorkbook()
				?.getWorkbook()
				.getStyles();
			const changes: Array<() => void> = [];
			let newCells = 0,
				textDelta = 0;
			for (const [r, cols] of Object.entries(p.cellValue))
				for (const [c, delta] of Object.entries(cols)) {
					const row = Number(r),
						column = Number(c);
					const rowId = sheet.axis("rows").active[row],
						colId = sheet.axis("columns").active[column];
					if (!rowId || !colId)
						throw new Error("Cell is outside worksheet limits.");
					const key = cellKey(rowId, colId);
					const value = matrix?.getCellRaw(row, column);
					if (
						delta === null ||
						(delta && ("v" in delta || "f" in delta || "p" in delta))
					) {
						const next: Input | null = value?.f
							? parseFormula(value.f, this.book, sheet)
							: value?.p?.body?.dataStream
								? value.p.body.dataStream.replace(/\r\n$/u, "")
								: value?.t === CellValueType.BOOLEAN && value.v != null
									? Boolean(value.v)
									: (value?.v ?? null);
						const previous = sheet.inputs.get(key);
						newCells += Number(next !== null) - Number(previous !== undefined);
						textDelta += inputBytes(next) - inputBytes(previous);
						changes.push(() => sheet.setInput(row, column, next));
					}
					if (delta === null || (delta && "s" in delta)) {
						const style = nativeStyle(
							styles?.getStyleByCell(value) as IStyleData | undefined,
						);
						changes.push(() =>
							Object.keys(style).length
								? sheet.styles.set(key, style)
								: sheet.styles.delete(key),
						);
					}
				}
			if (
				this.book.list().reduce((sum, s) => sum + s.inputs.size, 0) + newCells >
				LIMITS.cells
			)
				throw new Error("Workbook exceeds 2 million populated cells.");
			if (
				this.book.list().reduce((sum, s) => sum + s.inputs.textBytes, 0) +
					textDelta >
				LIMITS.textBytes
			)
				throw new Error(
					"Workbook exceeds 128 MiB of decoded cell/formula text.",
				);
			for (const change of changes) change();
		}
	}
	private sort(sheet: Sheet, p: Params) {
		if (!p.range || !p.order) return;
		const changes: Array<{
			row: number;
			column: number;
			input: Input | null;
			style?: CellStyle;
		}> = [];
		for (const [destination, source] of Object.entries(p.order))
			for (
				let column = p.range.startColumn;
				column <= p.range.endColumn;
				column++
			) {
				const row = Number(destination);
				const input = sheet.input(source, column);
				const sourceKey = cellKey(
					sheet.axis("rows").active[source]!,
					sheet.axis("columns").active[column]!,
				);
				changes.push({
					row,
					column,
					input:
						typeof input === "object"
							? copyFormula(input, this.book, sheet, sheet, row - source, 0)
							: (input ?? null),
					style: sheet.styles.get(sourceKey),
				});
			}
		for (const change of changes) {
			sheet.setInput(change.row, change.column, change.input);
			const key = cellKey(
				sheet.axis("rows").active[change.row]!,
				sheet.axis("columns").active[change.column]!,
			);
			if (change.style) sheet.styles.set(key, change.style);
			else sheet.styles.delete(key);
		}
	}
	private changed = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
		for (const event of events) {
			const [sheetId, field] = event.path;
			if (
				typeof sheetId !== "string" ||
				!["inputs", "styles"].includes(String(field))
			) {
				this.structuralPending = true;
				continue;
			}
			const keys = this.dirty.get(sheetId) ?? new Set<string>();
			for (const key of event.changes.keys.keys()) keys.add(key);
			this.dirty.set(sheetId, keys);
		}
		this.schedule();
	};
	private schedule() {
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => {
			this.scheduled = false;
			if (!this.disposed) this.flush();
		});
	}
	private flush() {
		this.applying = true;
		try {
			if (this.structuralPending) {
				this.structuralPending = false;
				this.rebuild();
			} else {
				for (const [id, keys] of this.dirty)
					for (const key of keys)
						this.graph.update(id, key, this.book.sheet(id)?.inputs.get(key));
				const cycles = this.graph.cycles();
				for (const key of new Set([...cycles, ...this.cycles]))
					if (cycles.has(key) !== this.cycles.has(key)) {
						const slash = key.indexOf("/"),
							id = key.slice(0, slash),
							cell = key.slice(slash + 1);
						const keys = this.dirty.get(id) ?? new Set<string>();
						keys.add(cell);
						this.dirty.set(id, keys);
					}
				this.cycles = cycles;
				for (const [id, keys] of this.dirty) {
					const sheet = this.book.sheet(id);
					if (!sheet) continue;
					const cellValue: Record<
						number,
						Record<number, ICellData | null>
					> = {};
					for (const key of keys) {
						const [r, c] = splitCellKey(key);
						const row = sheet.axis("rows").index.get(r),
							column = sheet.axis("columns").index.get(c);
						if (row === undefined || column === undefined) continue;
						(cellValue[row] ??= {})[column] = {
							v: null,
							f: null,
							p: null,
							s: null,
							...engineCell(
								sheet.inputs.get(key),
								sheet.styles.get(key),
								this.book,
								this.cycles.has(`${id}/${key}`),
							),
						};
					}
					this.engine.univerAPI.syncExecuteCommand(
						"sheet.mutation.set-range-values",
						{ unitId: UNIT_ID, subUnitId: id, cellValue },
						{ fromCollab: true },
					);
				}
			}
		} catch (error) {
			this.onError(error instanceof Error ? error.message : String(error));
		} finally {
			this.dirty.clear();
			this.applying = false;
		}
	}
	private rebuild() {
		this.applying = true;
		try {
			const active = this.engine.univerAPI.getActiveWorkbook();
			const selected = active?.getActiveSheet()?.getSheetId();
			const localViews = (active?.getSheets?.() ?? []).map((view) => {
				const filter = view.getFilter();
				const range = filter?.getRange().getRange();
				return {
					id: view.getSheetId(),
					selection: view.getActiveRange()?.getRange(),
					scroll: view.getScrollState(),
					range,
					criteria: range
						? Array.from(
								{ length: range.endColumn - range.startColumn + 1 },
								(_, n) =>
									[
										n + range.startColumn,
										filter!.getColumnFilterCriteria(n + range.startColumn),
									] as const,
							)
						: [],
				};
			});
			if (active) this.engine.univerAPI.disposeUnit(UNIT_ID);
			this.graph.rebuild();
			this.cycles = this.graph.cycles();
			const next = this.engine.univerAPI.createWorkbook(
				projectWorkbook(this.book, this.cycles),
			);
			const sheets = this.book.list();
			const needsRecovery =
				!sheets.length ||
				sheets.some(
					(s) =>
						!s.axis("rows").active.length || !s.axis("columns").active.length,
				);
			this.onRecovery(needsRecovery);
			next.setEditable(!this.readOnly && !needsRecovery);
			if (selected && next.getSheetBySheetId(selected))
				next.setActiveSheet(selected);
			for (const state of localViews) {
				const view = next.getSheetBySheetId(state.id),
					sheet = this.book.sheet(state.id);
				if (!view || !sheet) continue;
				const maxRow = sheet.axis("rows").active.length - 1,
					maxColumn = sheet.axis("columns").active.length - 1;
				if (maxRow < 0 || maxColumn < 0) continue;
				const range = (r: IRange) =>
					view.getRange(
						Math.min(r.startRow, maxRow),
						Math.min(r.startColumn, maxColumn),
						Math.min(r.endRow, maxRow) - Math.min(r.startRow, maxRow) + 1,
						Math.min(r.endColumn, maxColumn) -
							Math.min(r.startColumn, maxColumn) +
							1,
					);
				if (state.range) {
					const filter = range(state.range).createFilter();
					for (const [column, criterion] of state.criteria)
						if (criterion && column <= maxColumn)
							filter?.setColumnFilterCriteria(column, criterion);
				}
				if (state.id === selected) {
					if (state.selection) view.setActiveRange(range(state.selection));
					view.scrollToCell(
						Math.min(state.scroll.sheetViewStartRow, maxRow),
						Math.min(state.scroll.sheetViewStartColumn, maxColumn),
						0,
					);
				}
			}
		} finally {
			this.applying = false;
		}
	}
	addBlankGrid() {
		if (this.readOnly) return;
		this.book.transact(() => {
			if (!this.book.list().length) this.book.addSheet("Sheet1");
			for (const sheet of this.book.list())
				for (const axis of ["rows", "columns"] as const)
					if (!sheet.axis(axis).active.length) sheet.insert(axis, 0, 1);
		});
	}
	dispose() {
		this.disposed = true;
		this.book.sheets.unobserveDeep(this.changed);
		for (const item of this.disposables) item.dispose();
		this.book.destroy();
	}
}
