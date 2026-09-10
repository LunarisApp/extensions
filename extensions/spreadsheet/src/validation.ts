import { LIMITS } from "./limits";
import type { CellReference, Input, WorkbookSnapshot } from "./model";
const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown): value is string =>
	typeof value === "string" && /^[\w.-]{1,128}$/u.test(value);
const reference = (value: unknown): value is CellReference =>
	record(value) &&
	validId(value.sheet) &&
	validId(value.row) &&
	validId(value.column) &&
	typeof value.absoluteRow === "boolean" &&
	typeof value.absoluteColumn === "boolean";
function input(value: unknown): value is Input {
	if (
		typeof value === "string" ||
		typeof value === "boolean" ||
		(typeof value === "number" && Number.isFinite(value))
	)
		return true;
	return (
		record(value) &&
		value.kind === "formula" &&
		Array.isArray(value.tokens) &&
		value.tokens.length <= 10_000 &&
		(value.unsupported === undefined ||
			typeof value.unsupported === "string") &&
		value.tokens.every(
			(token) =>
				typeof token === "string" ||
				(record(token) &&
					reference(token.reference) &&
					(token.end === undefined || reference(token.end)) &&
					typeof token.qualified === "boolean"),
		)
	);
}
/** Validate without cloning millions of cell objects. */
export function assertWorkbook(
	value: unknown,
	inputEntries?: (sheetId: string) => Iterable<[string, unknown]>,
): asserts value is WorkbookSnapshot {
	if (
		!record(value) ||
		value.format !== "lunaris.spreadsheet" ||
		value.version !== 1 ||
		typeof value.name !== "string" ||
		!Array.isArray(value.sheets) ||
		!value.sheets.length
	)
		throw new Error("Invalid or unsupported native workbook.");
	let cells = 0;
	let text = 0;
	const ids = new Set<string>();
	for (const sheet of value.sheets) {
		if (
			!record(sheet) ||
			!validId(sheet.id) ||
			ids.has(sheet.id) ||
			typeof sheet.name !== "string" ||
			!sheet.name.trim()
		)
			throw new Error("Invalid or duplicate worksheet.");
		ids.add(sheet.id);
		for (const axis of ["rows", "columns"]) {
			const values = sheet[axis];
			if (
				!Array.isArray(values) ||
				!values.length ||
				!values.every(validId) ||
				new Set(values).size !== values.length
			)
				throw new Error("Invalid worksheet identities.");
		}
		const rows = new Set(sheet.rows as string[]),
			columns = new Set(sheet.columns as string[]);
		for (const [field, axis] of [
			["deletedRows", rows],
			["deletedColumns", columns],
		] as const)
			if (
				!Array.isArray(sheet[field]) ||
				!(sheet[field] as unknown[]).every(
					(id) => typeof id === "string" && axis.has(id),
				)
			)
				throw new Error("Invalid deleted axis.");
		const activeRows = rows.size - new Set(sheet.deletedRows as string[]).size,
			activeColumns =
				columns.size - new Set(sheet.deletedColumns as string[]).size;
		if (
			activeRows < 1 ||
			activeRows > LIMITS.rows ||
			activeColumns < 1 ||
			activeColumns > LIMITS.columns
		)
			throw new Error("Worksheet exceeds row or column limits.");
		if (
			!record(sheet.inputs) ||
			!record(sheet.styles) ||
			!record(sheet.rowSizes) ||
			!record(sheet.columnSizes) ||
			!record(sheet.freeze)
		)
			throw new Error("Invalid worksheet data.");
		const inputs = sheet.inputs;
		const entries =
			inputEntries?.(sheet.id) ??
			(function* () {
				for (const key of Object.keys(inputs))
					yield [key, inputs[key]] as [string, unknown];
			})();
		for (const [key, cell] of entries) {
			const [r, c, ...extra] = key.split("/");
			if (extra.length || !rows.has(r!) || !columns.has(c!) || !input(cell))
				throw new Error("Invalid cell input.");
			if (++cells > LIMITS.cells)
				throw new Error("Workbook exceeds 2 million populated cells.");
			text += encoder.encode(
				typeof cell === "object" ? JSON.stringify(cell) : String(cell),
			).length;
			if (text > LIMITS.textBytes)
				throw new Error(
					"Workbook exceeds 128 MiB of decoded cell/formula text.",
				);
		}
		for (const [key, style] of Object.entries(sheet.styles)) {
			const [r, c, ...extra] = key.split("/");
			if (extra.length || !rows.has(r!) || !columns.has(c!) || !record(style))
				throw new Error("Invalid cell formatting.");
			for (const [property, v] of Object.entries(style)) {
				if (
					![
						"bold",
						"italic",
						"color",
						"background",
						"alignment",
						"numberFormat",
					].includes(property)
				)
					throw new Error("Unsupported native formatting property.");
				if (["bold", "italic"].includes(property) && typeof v !== "boolean")
					throw new Error("Invalid font style.");
				if (
					["color", "background"].includes(property) &&
					(typeof v !== "string" || !/^#[0-9a-f]{3,8}$/iu.test(v))
				)
					throw new Error("Invalid cell color.");
				if (
					property === "alignment" &&
					!["left", "center", "right"].includes(String(v))
				)
					throw new Error("Invalid alignment.");
				if (
					property === "numberFormat" &&
					(typeof v !== "string" || v.length > 1024)
				)
					throw new Error("Invalid number format.");
			}
		}
		for (const [field, axis] of [
			["rowSizes", rows],
			["columnSizes", columns],
		] as const)
			for (const [id, size] of Object.entries(
				sheet[field] as Record<string, unknown>,
			))
				if (
					!axis.has(id) ||
					typeof size !== "number" ||
					!Number.isFinite(size) ||
					size <= 0 ||
					size > 10_000
				)
					throw new Error("Invalid row or column size.");
		for (const [dimension, maximum] of [
			["rows", activeRows],
			["columns", activeColumns],
		] as const) {
			const n = sheet.freeze[dimension];
			if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > maximum)
				throw new Error("Invalid frozen range.");
		}
	}
}
