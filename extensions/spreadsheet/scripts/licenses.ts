import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Keep dependency notices inside the immutable executable, including workers.
 * Identical license texts are grouped so Apache notices do not dominate size. */
export function licenseNotices(): Plugin {
	return {
		name: "spreadsheet-license-notices",
		generateBundle(_options, bundle) {
			for (const chunk of Object.values(bundle)) {
				if (chunk.type !== "chunk") continue;
				const packages = new Set<string>();
				for (const id of Object.keys(chunk.modules)) {
					const at = id.lastIndexOf("/node_modules/");
					if (at < 0) continue;
					const parts = id.slice(at + 14).split("/");
					const name = parts[0]!.startsWith("@")
						? parts.slice(0, 2).join("/")
						: parts[0]!;
					packages.add(id.slice(0, at + 14) + name);
				}
				const texts = new Map<string, string[]>();
				for (const directory of packages) {
					const metadata = JSON.parse(
						readFileSync(path.join(directory, "package.json"), "utf8"),
					);
					const files = readdirSync(directory).filter((name) =>
						/^(licen[cs]e|notice|copying)(\.(txt|md))?$/i.test(name),
					);
					for (const name of files) {
						const text = readFileSync(
							path.join(directory, name),
							"utf8",
						).trim();
						const owners = texts.get(text) ?? [];
						owners.push(`${metadata.name}@${metadata.version} (${name})`);
						texts.set(text, owners);
					}
				}
				const notice = [...texts]
					.map(([text, owners]) => `${owners.join(", ")}\n\n${text}`)
					.join("\n\n---\n\n");
				chunk.code = `/*! Bundled dependency notices\n${notice.replaceAll("*/", "* /")}\n*/\n${chunk.code}`;
			}
		},
	};
}
