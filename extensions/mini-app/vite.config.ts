import { defineLunarisPluginConfig } from "@lunarisapp/plugin-sdk/vite";

const config = await defineLunarisPluginConfig();
const output = config.build?.rollupOptions?.output;
if (output && !Array.isArray(output)) {
	// SDK validates the bundle in a VM without the browser URL global.
	output.banner =
		'globalThis.URL??=class URL{constructor(value){this.protocol=String(value).split(":",1)[0]+":"}};';
}

export default config;
