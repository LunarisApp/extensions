import {
	PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
	PLUGIN_SANDBOX_BOOTSTRAP_CSP,
} from "@lunarisapp/plugin-sdk";
const built = await Bun.build({
	entrypoints: [import.meta.dir + "/host.ts"],
	target: "browser",
	minify: true,
});
if (!built.success) throw new Error(String(built.logs));
const script = await Bun.file("dist/main.js").bytes();
const styles = await Bun.file("dist/styles.css").text();
const frame = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src blob: ${PLUGIN_SANDBOX_BOOTSTRAP_CSP}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src blob:; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script id="lunaris-plugin-script" type="application/octet-stream">${Buffer.from(script).toString("base64")}</script><script id="lunaris-plugin-style" type="application/octet-stream">${Buffer.from(styles).toString("base64")}</script><script>${PLUGIN_SANDBOX_BOOTSTRAP_SOURCE}</script>`;
Bun.serve({
	port: 4382,
	fetch(request) {
		const path = new URL(request.url).pathname;
		if (path === "/frame")
			return new Response(frame, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		if (path === "/host.js")
			return new Response(built.outputs[0], {
				headers: { "Content-Type": "application/javascript; charset=utf-8" },
			});
		return new Response(
			'<!doctype html><html><body style="margin:0"><script type="module" src="/host.js"></script></body></html>',
			{ headers: { "Content-Type": "text/html; charset=utf-8" } },
		);
	},
});
console.log("QA server http://localhost:4382");
