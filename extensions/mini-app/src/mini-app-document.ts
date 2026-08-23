import {
	PLUGIN_SANDBOX_BOOTSTRAP_CSP,
	PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
} from "@lunarisapp/plugin-sdk";

export const MINI_APP_CSP = [
	"default-src 'none'",
	`script-src blob: ${PLUGIN_SANDBOX_BOOTSTRAP_CSP}`,
	"script-src-attr 'none'",
	"style-src 'unsafe-inline'",
	"img-src data: blob:",
	"font-src data:",
	"media-src data: blob:",
	"connect-src 'none'",
	"frame-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
].join("; ");

const SCRIPT_ATTRIBUTE = "data-lunaris-mini-app-script";
const JAVASCRIPT_MIME_TYPE = /^(?:application|text)\/(?:java|ecma)script$/;
const SCRIPT_RUNNER_SOURCE = `
void (async () => {
	const decode = (value) => Uint8Array.from(
		atob(value),
		(character) => character.charCodeAt(0),
	);
	const placeholders = Array.from(document.querySelectorAll(
		"script[${SCRIPT_ATTRIBUTE}]",
	));
	let heldDomContentLoaded = false;
	const holdDomContentLoaded = (event) => {
		heldDomContentLoaded = true;
		event.stopImmediatePropagation();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", holdDomContentLoaded, true);
	}

	for (const placeholder of placeholders) {
		const script = document.createElement("script");
		for (const { name, value } of Array.from(placeholder.attributes)) {
			if (
				name !== "type" &&
				name !== "integrity" &&
				name !== "nonce" &&
				name !== "${SCRIPT_ATTRIBUTE}"
			) {
				script.setAttribute(name, value);
			}
		}
		const originalType = placeholder.getAttribute("${SCRIPT_ATTRIBUTE}");
		if (originalType) script.type = originalType;
		script.async = false;
		const scriptUrl = URL.createObjectURL(new Blob(
			[decode(placeholder.textContent || "")],
			{ type: "text/javascript" },
		));
		await new Promise((resolve) => {
			script.onload = script.onerror = () => {
				URL.revokeObjectURL(scriptUrl);
				resolve();
			};
			script.src = scriptUrl;
			placeholder.replaceWith(script);
		});
	}

	document.removeEventListener("DOMContentLoaded", holdDomContentLoaded, true);
	if (heldDomContentLoaded || document.readyState !== "loading") {
		document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
	}
})();`;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.byteLength; offset += 32_768) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
	}
	return btoa(binary);
}

function encodeText(value: string): string {
	return bytesToBase64(new TextEncoder().encode(value));
}

function isExecutableInlineScript(script: HTMLScriptElement): boolean {
	if (script.hasAttribute("src")) return false;
	const type = script.type.trim().toLowerCase();
	return !type || type === "module" || JAVASCRIPT_MIME_TYPE.test(type);
}

function replaceContentSecurityPolicy(document: Document): HTMLMetaElement {
	document
		.querySelectorAll<HTMLMetaElement>("meta[http-equiv]")
		.forEach((meta) => {
			if (meta.httpEquiv.toLowerCase() === "content-security-policy") {
				meta.remove();
			}
		});

	const policy = document.createElement("meta");
	policy.content = MINI_APP_CSP;
	policy.httpEquiv = "Content-Security-Policy";
	return policy;
}

function encodeInlineScripts(document: Document): number {
	const scripts = Array.from(document.scripts).filter(isExecutableInlineScript);
	for (const script of scripts) {
		script.setAttribute(SCRIPT_ATTRIBUTE, script.getAttribute("type") ?? "");
		script.type = "application/octet-stream";
		script.textContent = encodeText(script.textContent ?? "");
	}
	return scripts.length;
}

function addScriptBootstrap(document: Document): void {
	const runnerPayload = document.createElement("script");
	runnerPayload.id = "lunaris-plugin-script";
	runnerPayload.type = "application/octet-stream";
	runnerPayload.textContent = encodeText(SCRIPT_RUNNER_SOURCE);

	const stylePayload = document.createElement("script");
	stylePayload.id = "lunaris-plugin-style";
	stylePayload.type = "application/octet-stream";

	const bootstrap = document.createElement("script");
	bootstrap.textContent = PLUGIN_SANDBOX_BOOTSTRAP_SOURCE;
	document.head.firstElementChild?.after(runnerPayload, stylePayload);
	document.body.append(bootstrap);
}

export function buildMiniAppDocument(source: string): string {
	const document = new DOMParser().parseFromString(source, "text/html");
	const policy = replaceContentSecurityPolicy(document);
	const scriptCount = encodeInlineScripts(document);

	document.head.prepend(policy);
	if (scriptCount > 0) addScriptBootstrap(document);

	return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
