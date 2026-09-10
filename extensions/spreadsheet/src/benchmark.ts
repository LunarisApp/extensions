import { writeFileSync } from "node:fs";
import * as Y from "yjs";
import { Workbook, initializeWorkbook, cellKey } from "./model";
import { parseFormula } from "./formulas";
const count = Number(process.argv[2] ?? 100_000);
const startMemory = process.memoryUsage().rss;
const doc = new Y.Doc();
const book = new Workbook(doc);
const start = performance.now();
doc.transact(() => {
	book.metadata.set("version", 1);
	book.metadata.set("name", "Scale benchmark");
	const sheet = book.addSheet("Data", count, 20);
	(sheet.data.get("baseRows") as Y.Array<string>).push(
		sheet.axis("rows").active,
	);
	sheet.inputs.importOrdered(
		(function* () {
			for (let row = 0; row < count; row++)
				for (let column = 0; column < 20; column++) {
					yield [
						cellKey(
							sheet.axis("rows").active[row]!,
							sheet.axis("columns").active[column]!,
						),
						column === 19 && row % 5 === 0
							? parseFormula(`=B${row + 1}+C${row + 1}`, book, sheet)
							: column % 3 === 0
								? `Row ${row}`
								: row + column,
					] as [string, import("./model").Input];
				}
		})(),
	);
});
const importMs = performance.now() - start;
const encoded = Y.encodeStateAsUpdateV2(doc);
const replica = new Y.Doc();
const hydrateStart = performance.now();
Y.applyUpdateV2(replica, encoded);
const hydrateMs = performance.now() - hydrateStart;
const replicaBook = new Workbook(replica);
const sheet = book.list()[0]!;
const timings: number[] = [];
let deltaBytes = 0;
doc.on("updateV2", (update) => {
	deltaBytes = update.byteLength;
});
for (let i = 0; i < 100; i++) {
	const start = performance.now();
	book.transact(() => sheet.setInput(i, 0, i));
	timings.push(performance.now() - start);
}
timings.sort((a, b) => a - b);
console.log(
	JSON.stringify(
		{
			rows: count,
			cells: count * 20,
			formulas: Math.ceil(count / 5),
			importMs,
			hydrateMs,
			editP95Ms: timings[94],
			snapshotBytes: encoded.byteLength,
			oneCellDeltaBytes: deltaBytes,
			incrementalRssMiB:
				(process.memoryUsage().rss - startMemory) / 1024 / 1024,
			replicaSheets: replicaBook.list().length,
			scope:
				"Yjs model only; does not measure browser rendering, worker calculation, or host sync",
		},
		null,
		2,
	),
);
if (process.argv[3])
	writeFileSync(process.argv[3], JSON.stringify(book.snapshot()));
book.destroy();
replicaBook.destroy();
doc.destroy();
replica.destroy();
