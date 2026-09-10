import type {
	Axis,
	CellReference,
	Formula,
	ReferenceToken,
	Sheet,
	Workbook,
} from "./model";

export const FUNCTIONS = new Set([
	"SUM",
	"AVERAGE",
	"MIN",
	"MAX",
	"COUNT",
	"COUNTA",
	"COUNTBLANK",
	"IF",
	"IFS",
	"IFERROR",
	"AND",
	"OR",
	"NOT",
	"SUMIF",
	"SUMIFS",
	"COUNTIF",
	"COUNTIFS",
	"ROUND",
	"ROUNDUP",
	"ROUNDDOWN",
	"ABS",
	"INT",
	"MOD",
	"SQRT",
	"POWER",
	"VLOOKUP",
	"HLOOKUP",
	"INDEX",
	"MATCH",
	"LEN",
	"LEFT",
	"RIGHT",
	"MID",
	"CONCAT",
	"CONCATENATE",
	"LOWER",
	"UPPER",
	"TRIM",
	"SUBSTITUTE",
	"REPLACE",
	"FIND",
	"SEARCH",
	"TEXT",
	"VALUE",
	"DATE",
	"YEAR",
	"MONTH",
	"DAY",
	"DAYS",
	"ISBLANK",
	"ISNUMBER",
	"ISTEXT",
]);
const address = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)$/;
const errorLiteral = /#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!|CYCLE!)/g;
// String literals are consumed before references, including Excel's doubled quotes.
const lex =
	/"(?:[^"]|"")*"|(?:(?:'(?:[^']|'')+'|[\p{L}_][\p{L}\p{N}_.]*)!)?\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?/gu;
export function columnName(index: number): string {
	let name = "";
	for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
		name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
	return name;
}
export function columnIndex(name: string): number {
	return (
		[...name.toUpperCase()].reduce(
			(n, char) => n * 26 + char.charCodeAt(0) - 64,
			0,
		) - 1
	);
}
function resolveReference(
	sheet: Sheet,
	text: string,
): CellReference | undefined {
	const match = address.exec(text);
	if (!match) return;
	const row = sheet.axis("rows").active[Number(match[4]) - 1];
	const column = sheet.axis("columns").active[columnIndex(match[2]!)];
	if (!row || !column) return;
	return {
		sheet: sheet.id,
		row,
		column,
		absoluteRow: match[3] === "$",
		absoluteColumn: match[1] === "$",
	};
}
export function parseFormula(
	source: string,
	book: Workbook,
	sheet: Sheet,
): Formula {
	if (!source.startsWith("=")) throw new Error("Formulas must begin with =.");
	const tokens: Formula["tokens"] = [];
	let at = 0;
	let unsupported: string | undefined;
	for (const match of source.matchAll(lex)) {
		const start = match.index;
		const text = match[0];
		if (text.startsWith('"')) continue;
		if (
			/[\p{L}\p{N}_.]/u.test(source[start - 1] ?? "") ||
			/[\p{L}\p{N}_(!]/u.test(source[start + text.length] ?? "")
		)
			continue;
		if (start > at) tokens.push(source.slice(at, start));
		const bang = text.lastIndexOf("!");
		const sheetName =
			bang < 0
				? undefined
				: text.slice(0, bang).replace(/^'|'$/g, "").replaceAll("''", "'");
		const target =
			sheetName === undefined
				? sheet
				: book
						.list()
						.find(
							(candidate) =>
								candidate.name.toLowerCase() === sheetName.toLowerCase(),
						);
		const [from, to] = text.slice(bang + 1).split(":");
		const reference = target && resolveReference(target, from!);
		const end = target && to ? resolveReference(target, to) : undefined;
		if (!reference || (to && !end)) {
			tokens.push(text);
			unsupported = `Reference outside workbook dimensions: ${text}`;
		} else
			tokens.push({ reference, ...(end ? { end } : {}), qualified: bang >= 0 });
		at = start + text.length;
	}
	if (at < source.length) tokens.push(source.slice(at));
	// Remaining identifiers must be function calls or boolean literals, not names.
	const remainder = tokens
		.filter((token): token is string => typeof token === "string")
		.join(" ")
		.replace(/"(?:[^"]|"")*"/g, "")
		.replace(errorLiteral, "");
	// Inspect only expression text. Quoted sheet names may contain parentheses
	// or brackets and must not be mistaken for function calls or array syntax.
	for (const match of remainder.matchAll(/([A-Za-z_][A-Za-z_0-9.]*)\s*\(/g))
		if (!FUNCTIONS.has(match[1]!.toUpperCase()))
			unsupported = `Unsupported function: ${match[1]}`;
	if (/[\[\]{}#]/u.test(remainder))
		unsupported = "Unsupported reference or array expression";
	for (const match of remainder.matchAll(
		/\b([A-Za-z_][A-Za-z_0-9.]*)\b(\s*\()?/g,
	)) {
		if (!match[2] && !["TRUE", "FALSE", "E"].includes(match[1]!.toUpperCase()))
			unsupported ??= "Named references are not supported";
	}
	return { kind: "formula", tokens, ...(unsupported ? { unsupported } : {}) };
}
function position(axis: Axis, key: string): number | undefined {
	return axis.index.get(key);
}
function rangeEnds(
	axis: Axis,
	from: string,
	to: string,
): [number, number] | undefined {
	const first = axis.physical.get(from);
	const last = axis.physical.get(to);
	if (first === undefined || last === undefined) return;
	const low = Math.min(first, last);
	const high = Math.max(first, last);
	let begin: number | undefined;
	let end: number | undefined;
	for (let n = low; n <= high; n++) {
		const active = axis.index.get(axis.all[n]!);
		if (active !== undefined) {
			begin ??= active;
			end = active;
		}
	}
	return begin === undefined || end === undefined
		? undefined
		: first <= last
			? [begin, end]
			: [end, begin];
}
function formatAddress(
	ref: CellReference,
	row: number,
	column: number,
): string {
	return `${ref.absoluteColumn ? "$" : ""}${columnName(column)}${ref.absoluteRow ? "$" : ""}${row + 1}`;
}
export function renderReference(token: ReferenceToken, book: Workbook): string {
	const sheet = book.sheet(token.reference.sheet);
	if (!sheet) return "#REF!";
	const prefix = token.qualified
		? `'${sheet.name.replaceAll("'", "''")}'!`
		: "";
	if (token.end) {
		const rows = rangeEnds(
			sheet.axis("rows"),
			token.reference.row,
			token.end.row,
		);
		const columns = rangeEnds(
			sheet.axis("columns"),
			token.reference.column,
			token.end.column,
		);
		if (!rows || !columns) return "#REF!";
		return `${prefix}${formatAddress(token.reference, rows[0], columns[0])}:${formatAddress(token.end, rows[1], columns[1])}`;
	}
	const row = position(sheet.axis("rows"), token.reference.row);
	const column = position(sheet.axis("columns"), token.reference.column);
	return row === undefined || column === undefined
		? "#REF!"
		: prefix + formatAddress(token.reference, row, column);
}
export function formulaText(formula: Formula, book: Workbook): string {
	return formula.tokens
		.map((token) =>
			typeof token === "string" ? token : renderReference(token, book),
		)
		.join("");
}
export function copyFormula(
	formula: Formula,
	book: Workbook,
	fromSheet: Sheet,
	toSheet: Sheet,
	rowDelta: number,
	columnDelta: number,
): Formula {
	const tokens = formula.tokens.map((token) => {
		if (typeof token === "string") return token;
		const source = book.sheet(token.reference.sheet);
		const liveRows =
			token.end && source
				? rangeEnds(source.axis("rows"), token.reference.row, token.end.row)
				: undefined;
		const liveColumns =
			token.end && source
				? rangeEnds(
						source.axis("columns"),
						token.reference.column,
						token.end.column,
					)
				: undefined;
		if (token.end && (!liveRows || !liveColumns)) return "#REF!";
		const shift = (
			ref: CellReference,
			rangeRow?: number,
			rangeColumn?: number,
		): CellReference | undefined => {
			const sourceSheet = book.sheet(ref.sheet);
			const targetSheet = token.qualified ? sourceSheet : toSheet;
			if (!sourceSheet || !targetSheet) return;
			const row = rangeRow ?? sourceSheet.axis("rows").index.get(ref.row);
			const column =
				rangeColumn ?? sourceSheet.axis("columns").index.get(ref.column);
			if (row === undefined || column === undefined) return;
			const newRow =
				targetSheet.axis("rows").active[row + (ref.absoluteRow ? 0 : rowDelta)];
			const newColumn =
				targetSheet.axis("columns").active[
					column + (ref.absoluteColumn ? 0 : columnDelta)
				];
			if (!newRow || !newColumn) return;
			return { ...ref, sheet: targetSheet.id, row: newRow, column: newColumn };
		};
		const reference = shift(token.reference, liveRows?.[0], liveColumns?.[0]);
		const end = token.end && shift(token.end, liveRows?.[1], liveColumns?.[1]);
		return !reference || (token.end && !end)
			? "#REF!"
			: { ...token, reference, ...(end ? { end } : {}) };
	});
	return { ...formula, tokens };
}
