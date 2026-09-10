import {
	CellValueType,
	LocaleType,
	type ICellData,
	type IStyleData,
	type IWorkbookData,
	type IWorksheetData,
} from "@univerjs/core";
import { formulaText } from "./formulas";
import {
	type CellStyle,
	type Input,
	type Sheet,
	type Workbook,
	splitCellKey,
} from "./model";
export const UNIT_ID = "lunaris-workbook";
export function engineStyle(style?: CellStyle): IStyleData | undefined {
	if (!style) return;
	return {
		...(style.bold !== undefined ? { bl: style.bold ? 1 : 0 } : {}),
		...(style.italic !== undefined ? { it: style.italic ? 1 : 0 } : {}),
		...(style.color ? { cl: { rgb: style.color } } : {}),
		...(style.background ? { bg: { rgb: style.background } } : {}),
		...(style.alignment
			? { ht: { left: 1, center: 2, right: 3 }[style.alignment] }
			: {}),
		...(style.numberFormat ? { n: { pattern: style.numberFormat } } : {}),
	};
}
export function nativeStyle(style: IStyleData | undefined | null): CellStyle {
	return {
		...(style?.bl != null ? { bold: style.bl === 1 } : {}),
		...(style?.it != null ? { italic: style.it === 1 } : {}),
		...(style?.cl?.rgb ? { color: style.cl.rgb } : {}),
		...(style?.bg?.rgb ? { background: style.bg.rgb } : {}),
		...(style?.ht
			? {
					alignment: ({ 1: "left", 2: "center", 3: "right" } as const)[
						style.ht as 1 | 2 | 3
					],
				}
			: {}),
		...(style?.n?.pattern ? { numberFormat: style.n.pattern } : {}),
	};
}
export function engineCell(
	value: Input | undefined,
	style: CellStyle | undefined,
	book: Workbook,
	cycle = false,
): ICellData {
	const s = engineStyle(style);
	if (cycle) return { v: "#CYCLE!", t: CellValueType.STRING, s };
	if (typeof value === "object")
		return value.unsupported
			? {
					v: "#NAME?",
					t: CellValueType.STRING,
					s,
					custom: {
						unsupported: value.unsupported,
						source: formulaText(value, book),
					},
				}
			: { f: formulaText(value, book), s };
	return {
		...(value !== undefined
			? {
					v: value,
					t:
						typeof value === "number"
							? CellValueType.NUMBER
							: typeof value === "boolean"
								? CellValueType.BOOLEAN
								: CellValueType.STRING,
				}
			: {}),
		...(s ? { s } : {}),
	};
}
export function projectSheet(
	sheet: Sheet,
	book: Workbook,
	cycles = new Set<string>(),
): Partial<IWorksheetData> {
	const cellData: NonNullable<IWorksheetData["cellData"]> = {};
	const rows = sheet.axis("rows");
	const columns = sheet.axis("columns");
	function* cellKeys() {
		yield* sheet.inputs.keys();
		for (const key of sheet.styles.keys())
			if (!sheet.inputs.has(key)) yield key;
	}
	for (const key of cellKeys()) {
		const [r, c] = splitCellKey(key);
		const row = rows.index.get(r);
		const column = columns.index.get(c);
		if (row === undefined || column === undefined) continue;
		(cellData[row] ??= {})[column] = engineCell(
			sheet.inputs.get(key),
			sheet.styles.get(key),
			book,
			cycles.has(`${sheet.id}/${key}`),
		);
	}
	return {
		id: sheet.id,
		name: sheet.name,
		rowCount: Math.max(1, rows.active.length),
		columnCount: Math.max(1, columns.active.length),
		cellData,
		defaultRowHeight: 24,
		defaultColumnWidth: 100,
		rowData: Object.fromEntries(
			[...sheet.rowSizes].flatMap(([id, h]) =>
				rows.index.has(id) ? [[rows.index.get(id)!, { h }]] : [],
			),
		),
		columnData: Object.fromEntries(
			[...sheet.columnSizes].flatMap(([id, w]) =>
				columns.index.has(id) ? [[columns.index.get(id)!, { w }]] : [],
			),
		),
		freeze: {
			startRow: sheet.freeze.rows,
			startColumn: sheet.freeze.columns,
			xSplit: sheet.freeze.columns,
			ySplit: sheet.freeze.rows,
		},
	};
}
export function projectWorkbook(
	book: Workbook,
	cycles = new Set<string>(),
): Partial<IWorkbookData> {
	const sheets = book.list();
	if (!sheets.length)
		return {
			id: UNIT_ID,
			name: book.name,
			sheetOrder: ["empty"],
			sheets: {
				empty: {
					id: "empty",
					name: "No worksheets",
					rowCount: 1,
					columnCount: 1,
				} as IWorksheetData,
			},
		};
	return {
		id: UNIT_ID,
		name: book.name,
		appVersion: "0.25.1",
		locale: LocaleType.EN_US,
		sheetOrder: sheets.map((s) => s.id),
		sheets: Object.fromEntries(
			sheets.map((s) => [s.id, projectSheet(s, book, cycles)]),
		) as Record<string, IWorksheetData>,
	};
}
