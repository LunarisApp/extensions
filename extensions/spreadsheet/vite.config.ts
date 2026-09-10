import { defineLunarisPluginConfig } from "@lunarisapp/plugin-sdk/vite";
import type { Plugin } from "vite";
import { licenseNotices } from "./scripts/licenses";

// Univer's renderer includes word-processor hyphenation dictionaries for every
// language. Spreadsheet cells do not enable paragraph auto-hyphenation. Remove
// only their lazy-loader table, in both bundles, to keep the offline artifact small.
// Match the pinned 0.25.1 module explicitly; fail closed on upstream changes.
function spreadsheetRenderer(): Plugin {
	return {
		name: "spreadsheet-renderer",
		enforce: "pre",
		transform(code, id) {
			if (!id.endsWith("/@univerjs/engine-render/lib/es/index.js")) return;
			const pattern = /const PATTERN_LOADERS = \{[\s\S]*?\n\};/;
			if (!pattern.test(code))
				throw new Error(
					"Univer hyphenation module changed; review the spreadsheet build adapter.",
				);
			return {
				code: code.replace(pattern, "const PATTERN_LOADERS = {};"),
				map: null,
			};
		},
	};
}
const config = await defineLunarisPluginConfig();
config.plugins = [
	...(config.plugins ?? []),
	spreadsheetRenderer(),
	licenseNotices(),
];
config.worker ??= {};
config.worker.plugins = () =>
	[spreadsheetRenderer(), licenseNotices()] as ReturnType<
		NonNullable<NonNullable<typeof config.worker>["plugins"]>
	>;
export default config;
