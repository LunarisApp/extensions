import { HIDDEN_COMMANDS } from "./commands";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import en from "@univerjs/preset-sheets-core/locales/en-US";
import filterEn from "@univerjs/preset-sheets-filter/locales/en-US";
import sortEn from "@univerjs/preset-sheets-sort/locales/en-US";
import FormulaWorker from "./formula.worker?worker&inline";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";

export function createEngine(container: HTMLElement) {
	const worker = new FormulaWorker();
	const engine = createUniver({
		locale: LocaleType.EN_US,
		locales: { [LocaleType.EN_US]: mergeLocales(en, filterEn, sortEn) },
		presets: [
			UniverSheetsCorePreset({
				container,
				workerURL: worker,
				menu: Object.fromEntries(
					HIDDEN_COMMANDS.map((id) => [id, { hidden: true }]),
				),
			}),
			UniverSheetsFilterPreset(),
			UniverSheetsSortPreset(),
		],
	});
	return {
		...engine,
		dispose() {
			engine.univer.dispose();
			worker.terminate();
		},
	};
}
export type Engine = ReturnType<typeof createEngine>;
