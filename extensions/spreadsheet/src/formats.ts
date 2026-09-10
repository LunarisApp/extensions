import * as XLSX from "xlsx";
import * as Y from "yjs";
import { inputBytes } from "./cell-store";
import { LIMITS } from "./limits";
import { parseFormula, formulaText } from "./formulas";
import {
	Workbook,
	cellKey,
	initializeWorkbook,
	splitCellKey,
	type Input,
	type Scalar,
	type WorkbookSnapshot,
} from "./model";
import { assertWorkbook } from "./validation";

export type ExportFormat = "csv" | "tsv" | "xlsx" | "ods" | "json" | "native";
export interface ImportOptions {
	delimiter?: string;
	header?: boolean;
	types?: "text" | "infer";
}
export interface ImportResult {
	workbook: WorkbookSnapshot;
	warnings: string[];
	preview: Scalar[][];
}
/** Keep the UI/RPC handoff compact; materialize cells only in the storage initializer. */
export interface ImportPreview {
	serialized: string;
	name: string;
	sheetCount: number;
	warnings: string[];
	preview: Scalar[][];
}
export interface ConversionTask {
	action: "import" | "export";
	bytes?: ArrayBuffer;
	filename?: string;
	options?: ImportOptions;
	workbook?: WorkbookSnapshot;
	format?: ExportFormat;
	activeSheet?: string;
	calculated?: Record<string, Record<string, Scalar>>;
}
export interface ExportResult {
	bytes: ArrayBuffer;
	mimeType: string;
	extension: string;
	warnings: string[];
}
const encoder = new TextEncoder();
function safeScalar(text: string, types: ImportOptions["types"]): Scalar {
	if (types === "text" || /^[=+@\t\r]/u.test(text) || /^[-+]?0\d/u.test(text))
		return text;
	if (/^(?:true|false)$/iu.test(text)) return text.toLowerCase() === "true";
	if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/iu.test(text)) {
		const number = Number(text);
		const digits = text.replace(/[^0-9]/gu, "").replace(/^0+/u, "");
		if (
			Number.isFinite(number) &&
			digits.length <= 15 &&
			(!Number.isInteger(number) || Number.isSafeInteger(number))
		)
			return number;
	}
	return text;
}
/** RFC-style quoted fields, including embedded newlines; no formula inference. */
export function parseDelimited(text: string, delimiter: string): string[][] {
	const rows: string[][] = [];
	let populated = 0;
	const countField = () => {
		if (field && ++populated > LIMITS.cells)
			throw new Error("Workbook exceeds 2 million populated cells.");
		if (row.length >= LIMITS.columns)
			throw new Error("File exceeds worksheet columns.");
	};
	let row: string[] = [];
	let field = "";
	let quoted = false;
	let closed = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i]!;
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (char === '"') {
				quoted = false;
				closed = true;
			} else field += char;
			continue;
		}
		if (char === '"' && !field && !closed) {
			quoted = true;
			continue;
		}
		if (char === delimiter) {
			countField();
			row.push(field);
			field = "";
			closed = false;
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && text[i + 1] === "\n") i++;
			countField();
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
			closed = false;
			if (rows.length > LIMITS.rows)
				throw new Error("File exceeds 100,000 rows.");
		} else {
			if (closed) throw new Error("Unexpected text after a quoted CSV field.");
			field += char;
		}
	}
	if (quoted) throw new Error("Unclosed quoted CSV field.");
	if (field || row.length || closed) {
		countField();
		row.push(field);
		rows.push(row);
	}
	if (rows.length > LIMITS.rows) throw new Error("File exceeds 100,000 rows.");
	return rows;
}
function guardArchive(bytes: ArrayBuffer): void {
	const view = new DataView(bytes);
	if (view.byteLength < 4 || view.getUint32(0, true) !== 0x04034b50) return;
	let expanded = 0;
	let entries = 0;
	for (let i = 0; i + 46 <= view.byteLength; i++)
		if (view.getUint32(i, true) === 0x02014b50) {
			const size = view.getUint32(i + 24, true);
			if (size === 0xffffffff)
				throw new Error("ZIP64 workbooks are not supported.");
			expanded += size;
			entries++;
			if (expanded > 512 * 1024 * 1024 || entries > 20_000)
				throw new Error("Workbook archive expands beyond the supported size.");
			i +=
				45 +
				view.getUint16(i + 28, true) +
				view.getUint16(i + 30, true) +
				view.getUint16(i + 32, true);
		}
}
function gridSheet(
	name: string,
	grid: unknown[][],
	book: Workbook,
	types: ImportOptions["types"],
) {
	const columns = grid.reduce((max, row) => Math.max(max, row.length), 1);
	if (grid.length > LIMITS.rows || columns > LIMITS.columns)
		throw new Error("File exceeds worksheet dimensions.");
	const sheet = book.addSheet(
		name,
		Math.max(100, grid.length),
		Math.max(26, columns),
	);
	(sheet.data.get("baseRows") as Y.Array<string>).push(
		sheet.axis("rows").active,
	);
	let cells = 0,
		textBytes = 0;
	sheet.inputs.importOrdered(
		(function* () {
			for (let r = 0; r < grid.length; r++)
				for (const [column, value] of Object.entries(grid[r]!)) {
					const c = Number(column);
					if (value === null || value === undefined || value === "") continue;
					if (
						typeof value !== "string" &&
						typeof value !== "number" &&
						typeof value !== "boolean"
					)
						throw new Error(
							"JSON records must contain scalar values; nested objects are unsupported.",
						);
					if (
						typeof value === "number" &&
						!Number.isSafeInteger(value) &&
						Number.isInteger(value)
					)
						throw new Error(
							"JSON contains an unsafe integer. Encode large identifiers as strings.",
						);
					if (++cells > LIMITS.cells)
						throw new Error("Workbook exceeds 2 million populated cells.");
					textBytes += inputBytes(value as Input);
					if (textBytes > LIMITS.textBytes)
						throw new Error(
							"Workbook exceeds 128 MiB of decoded cell/formula text.",
						);
					yield [
						cellKey(
							sheet.axis("rows").active[r]!,
							sheet.axis("columns").active[c]!,
						),
						typeof value === "string" ? safeScalar(value, types) : value,
					] as [string, Input];
				}
		})(),
	);
	return sheet;
}
export function importFile(
	bytes: ArrayBuffer,
	filename: string,
	options: ImportOptions = {},
): ImportResult {
	if (bytes.byteLength > LIMITS.sourceBytes)
		throw new Error("Source file exceeds 64 MiB.");
	const extension = filename.toLowerCase().split(".").pop();
	const warnings: string[] = [];
	const doc = new Y.Doc();
	const book = new Workbook(doc);
	book.metadata.set("name", filename.replace(/\.[^.]+$/u, ""));
	book.metadata.set("version", 1);
	try {
		if (extension === "json") {
			const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
			if (
				data &&
				typeof data === "object" &&
				!Array.isArray(data) &&
				"format" in data
			) {
				assertWorkbook(data);
				return { workbook: data, warnings, preview: [] };
			}
			if (Array.isArray(data) && data.length > LIMITS.rows)
				throw new Error("JSON exceeds 100,000 rows.");
			if (!Array.isArray(data))
				throw new Error("JSON must contain an array of records or rows.");
			let grid: unknown[][];
			if (!data.length || Array.isArray(data[0])) {
				if (!data.every(Array.isArray))
					throw new Error("JSON rows must all be arrays.");
				grid = data;
			} else {
				if (
					!data.every(
						(row) => row && typeof row === "object" && !Array.isArray(row),
					)
				)
					throw new Error("JSON records must all be objects.");
				const columns = new Map<string, number>();
				for (const record of data)
					for (const key of Object.keys(record)) {
						if (!columns.has(key)) columns.set(key, columns.size);
						if (columns.size > LIMITS.columns)
							throw new Error("JSON exceeds worksheet columns.");
					}
				grid = [
					[...columns.keys()],
					...data.map((record) => {
						const row: unknown[] = [];
						for (const [key, value] of Object.entries(record))
							row[columns.get(key)!] = value;
						return row;
					}),
				];
			}
			gridSheet("Sheet1", grid, book, "text");
		} else if (
			extension === "csv" ||
			extension === "tsv" ||
			extension === "txt"
		) {
			const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/u, "");
			const delimiter = options.delimiter ?? (extension === "tsv" ? "\t" : ",");
			if (![",", "\t", ";", "|"].includes(delimiter))
				throw new Error("Unsupported delimiter.");
			const rows = parseDelimited(text, delimiter);
			const imported = gridSheet(
				"Sheet1",
				rows,
				book,
				options.types ?? "infer",
			);
			if (options.header) imported.data.set("freeze", { rows: 1, columns: 0 });
		} else if (extension === "xlsx" || extension === "ods") {
			guardArchive(bytes);
			const source = XLSX.read(bytes, {
				type: "array",
				cellFormula: true,
				cellNF: true,
				cellHTML: false,
				cellText: false,
				bookVBA: false,
				sheetRows: LIMITS.rows + 1,
			});
			for (const name of source.SheetNames) {
				const ws = source.Sheets[name]!;
				const range = XLSX.utils.decode_range(
					ws["!fullref"] ?? ws["!ref"] ?? "A1",
				);
				book.addSheet(
					name,
					Math.max(100, range.e.r + 1),
					Math.max(26, range.e.c + 1),
				);
			}
			let importedCells = 0,
				importedText = 0;
			for (const sheet of book.list()) {
				const ws = source.Sheets[sheet.name]!;
				(sheet.data.get("baseRows") as Y.Array<string>).push(
					sheet.axis("rows").active,
				);
				const imported: Record<string, Input> = {};
				for (const address in ws) {
					if (address.startsWith("!")) continue;
					const cell = ws[address];
					const { r, c } = XLSX.utils.decode_cell(address);
					const key = cellKey(
						sheet.axis("rows").active[r]!,
						sheet.axis("columns").active[c]!,
					);
					if (cell.t === "e" && !cell.f) {
						// SheetJS stores Excel error codes as numbers. Keep their error
						// semantics using a literal formula, never an ordinary number.
						imported[key] = parseFormula(
							`=${XLSX.utils.format_cell(cell)}`,
							book,
							sheet,
						);
					} else if (cell.f) {
						const formula = parseFormula(`=${cell.f}`, book, sheet);
						imported[key] = formula;
						if (formula.unsupported)
							warnings.push(`${sheet.name}!${address}: ${formula.unsupported}`);
					} else if (cell.v !== undefined && cell.v !== null) {
						let value = cell.v;
						const datePattern = String(cell.z ?? "").replace(
							/"[^"]*"|\[[^\]]*\]/g,
							"",
						);
						if (
							source.Workbook?.WBProps?.date1904 &&
							typeof value === "number" &&
							(/[dy]/i.test(datePattern) ||
								(/m/i.test(datePattern) && !/[hs]/i.test(datePattern)))
						) {
							value += 1462;
							warnings.push(
								"1904-system dates were converted to the standard 1900 date system.",
							);
						}
						if (
							typeof value === "string" ||
							typeof value === "boolean" ||
							typeof value === "number"
						)
							imported[key] = value;
					}
					if (imported[key] !== undefined) {
						if (++importedCells > LIMITS.cells)
							throw new Error("Workbook exceeds 2 million populated cells.");
						importedText += inputBytes(imported[key]);
						if (importedText > LIMITS.textBytes)
							throw new Error(
								"Workbook exceeds 128 MiB of decoded cell/formula text.",
							);
					}
					if (cell.z) sheet.styles.set(key, { numberFormat: cell.z });
					if (cell.c || cell.l || cell.r)
						warnings.push(
							"Comments, hyperlinks, and rich text formatting are not retained.",
						);
				}
				sheet.inputs.loadBase(imported);
				if (ws["!merges"]?.length)
					warnings.push("Merged cells are imported as ordinary cells.");
			}
			warnings.push(
				"Only cell values, supported formulas, and number formats are imported. Other workbook features and visual styling are not preserved.",
			);
		} else throw new Error("Choose CSV, TSV, XLSX, ODS, or JSON.");
		const workbook = book.snapshot();
		assertWorkbook(workbook);
		const first = book.list()[0]!;
		const preview = Array.from(
			{ length: Math.min(6, first.axis("rows").active.length) },
			(_, r) =>
				Array.from(
					{ length: Math.min(8, first.axis("columns").active.length) },
					(_, c) => {
						const value = first.input(r, c);
						return typeof value === "object"
							? formulaText(value, book)
							: (value ?? "");
					},
				),
		);
		return {
			workbook,
			warnings: [...new Set(warnings)].slice(0, 100),
			preview,
		};
	} finally {
		book.destroy();
		doc.destroy();
	}
}
function safeCsv(value: Scalar): string {
	const text = String(value);
	const safe =
		typeof value === "string" && /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
	return /[",\t\n\r;]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
export function exportFile(
	snapshot: WorkbookSnapshot,
	format: ExportFormat,
	activeSheet?: string,
	calculated: Record<string, Record<string, Scalar>> = {},
): ExportResult {
	assertWorkbook(snapshot);
	const warnings: string[] = [];
	let bytes: Uint8Array;
	let mimeType: string;
	let extension: string = format;
	if (format === "native") {
		bytes = encoder.encode(JSON.stringify(snapshot));
		mimeType = "application/json";
		extension = "lunaris.json";
	} else {
		const doc = new Y.Doc();
		initializeWorkbook(doc, snapshot);
		const book = new Workbook(doc);
		try {
			const chosen = book.sheet(activeSheet ?? "") ?? book.list()[0]!;
			const sheetData = (sheet: ReturnType<Workbook["list"]>[number]) => {
				const ws: XLSX.WorkSheet = {};
				let maxRow = 0,
					maxColumn = 0;
				for (const [key, input] of sheet.inputs) {
					const [rid, cid] = splitCellKey(key);
					const r = sheet.axis("rows").index.get(rid),
						c = sheet.axis("columns").index.get(cid);
					if (r === undefined || c === undefined) continue;
					const formula = typeof input === "object" ? input : undefined;
					let value: Scalar =
						typeof input !== "object"
							? input
							: input.unsupported
								? "#NAME?"
								: (calculated[sheet.id]?.[key] ?? "#N/A");
					if (
						formula &&
						!formula.unsupported &&
						calculated[sheet.id]?.[key] === undefined
					)
						warnings.push(
							"Some formula results are unavailable. Recalculate the workbook before exporting values.",
						);
					ws[XLSX.utils.encode_cell({ r, c })] = {
						v: value,
						t:
							typeof value === "number"
								? "n"
								: typeof value === "boolean"
									? "b"
									: "s",
						...(formula ? { f: formulaText(formula, book).slice(1) } : {}),
						...(sheet.styles.get(key)?.numberFormat
							? { z: sheet.styles.get(key)!.numberFormat }
							: {}),
					};
					maxRow = Math.max(maxRow, r);
					maxColumn = Math.max(maxColumn, c);
				}
				ws["!ref"] = XLSX.utils.encode_range({
					s: { r: 0, c: 0 },
					e: { r: maxRow, c: maxColumn },
				});
				return ws;
			};
			if (format === "xlsx" || format === "ods") {
				const target = XLSX.utils.book_new();
				for (const sheet of book.list())
					XLSX.utils.book_append_sheet(target, sheetData(sheet), sheet.name);
				bytes = new Uint8Array(
					XLSX.write(target, {
						type: "array",
						bookType: format,
						compression: true,
					}),
				);
				mimeType =
					format === "xlsx"
						? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						: "application/vnd.oasis.opendocument.spreadsheet";
				warnings.push(
					"Export preserves values, formulas, and supported number formats. Use native JSON to retain all spreadsheet styling.",
				);
			} else {
				const ws = sheetData(chosen);
				const range = XLSX.utils.decode_range(ws["!ref"]!);
				const rowCount = range.e.r + 1,
					columnCount = range.e.c + 1;
				const parts: Uint8Array[] = [];
				let total = 0;
				const append = (text: string) => {
					const part = encoder.encode(text);
					total += part.length;
					if (total > LIMITS.exportBytes)
						throw new Error("Export exceeds 256 MiB.");
					parts.push(part);
				};
				const rowAt = (r: number): Scalar[] =>
					Array.from(
						{ length: columnCount },
						(_, c) => ws[XLSX.utils.encode_cell({ r, c })]?.v ?? "",
					);
				if (format === "json") {
					const headers = rowAt(0).map(
						(value, index) => String(value) || `Column${index + 1}`,
					);
					if (new Set(headers).size !== headers.length)
						throw new Error(
							"Record JSON requires unique column headers. Rename duplicate headers or export native JSON.",
						);
					// Even an all-empty record repeats every key. Reject that minimum
					// before walking a huge sparse bounding rectangle.
					const minimumRecord =
						encoder.encode(
							JSON.stringify(
								Object.fromEntries(headers.map((key) => [key, ""])),
							),
						).length - headers.length;
					if (
						(rowCount - 1) * minimumRecord + Math.max(0, rowCount - 2) + 2 >
						LIMITS.exportBytes
					)
						throw new Error("Export exceeds 256 MiB.");
					append("[");
					for (let r = 1; r < rowCount; r++) {
						const row = rowAt(r);
						append(
							(r > 1 ? "," : "") +
								JSON.stringify(
									Object.fromEntries(headers.map((key, c) => [key, row[c]])),
								),
						);
					}
					append("]");
					mimeType = "application/json";
				} else {
					if (
						rowCount * (columnCount - 1) + (rowCount - 1) * 2 >
						LIMITS.exportBytes
					)
						throw new Error("Export exceeds 256 MiB.");
					let escaped = false;
					for (let r = 0; r < rowCount; r++) {
						const row = rowAt(r);
						escaped ||= row.some(
							(value) =>
								typeof value === "string" && /^[=+\-@\t\r]/u.test(value),
						);
						append(
							(r ? "\r\n" : "") +
								row.map(safeCsv).join(format === "tsv" ? "\t" : ","),
						);
					}
					if (escaped)
						warnings.push(
							"Formula-like text is prefixed with an apostrophe for safe CSV/TSV opening. Native JSON preserves exact strings.",
						);
					mimeType =
						format === "tsv" ? "text/tab-separated-values" : "text/csv";
				}
				bytes = new Uint8Array(total);
				let offset = 0;
				for (const part of parts) {
					bytes.set(part, offset);
					offset += part.length;
				}
			}
		} finally {
			book.destroy();
			doc.destroy();
		}
	}
	if (bytes.byteLength > LIMITS.exportBytes)
		throw new Error("Export exceeds 256 MiB.");
	return {
		bytes: bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		) as ArrayBuffer,
		mimeType,
		extension,
		warnings: [...new Set(warnings)],
	};
}
