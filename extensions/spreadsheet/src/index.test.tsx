import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { ResourceViewProps } from "@lunarisapp/plugin-sdk";
import { expect, it, vi } from "vitest";
import plugin from "./index";

const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));
vi.mock("@lunarisapp/plugin-sdk", () => ({ definePlugin: (plugin: unknown) => plugin }));
vi.mock("./editor", () => ({
	SpreadsheetEditor: () => {
		useEffect(() => {
			lifecycle.mounts++;
			return () => { lifecycle.unmounts++; };
		}, []);
		return <input defaultValue="" />;
	},
}));

it("preserves the editor on reopen and resets it for another resource", async () => {
	let renderer!: (props: ResourceViewProps) => ReactNode;
	await plugin.activate!({ contributions: {
		locales() {}, resourceType() {},
		view(view: { renderer: typeof renderer }) { renderer = view.renderer; },
	} } as never);
	const props = (resourceId: string) => ({
		params: {},
		resource: {
			resourceId,
			parentId: "root",
			resourceTypeId: "lunaris.spreadsheet",
			schemaId: "lunaris.spreadsheet.workbook",
			schemaVersion: 1,
		},
		storage: { content: { kind: "yjs", storageId: "content" } },
		reportReady: () => {},
	}) as ResourceViewProps;
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	try {
		// Renderers are factories; editor hooks must run in their own component.
		const first = renderer(props("resource"));
		await act(async () => root.render(first));
		const input = container.querySelector("input")!;
		input.value = "In-progress edit";
		input.focus();
		const reopened = renderer(props("resource"));
		await act(async () => root.render(reopened));
		expect(container.querySelector("input")).toBe(input);
		expect(input.value).toBe("In-progress edit");
		expect(document.activeElement).toBe(input);
		expect(lifecycle.mounts).toBe(1);
		expect(lifecycle.unmounts).toBe(0);
		const other = renderer(props("other"));
		await act(async () => root.render(other));
		expect(container.querySelector("input")).not.toBe(input);
		expect(lifecycle.mounts).toBe(2);
		expect(lifecycle.unmounts).toBe(1);
	} finally {
		await act(async () => root.unmount());
		container.remove();
	}
});
