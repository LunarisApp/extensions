import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Doc } from "yjs";
import { YjsExcalidraw } from "./yjs-excalidraw";

vi.mock("./excalidraw", () => ({
	ExcalidrawEditor: ({
		initialData,
	}: {
		initialData: { files?: Record<string, unknown> };
	}) => <div>{Object.keys(initialData.files ?? {}).join(",")}</div>,
}));

afterEach(cleanup);

describe("YjsExcalidraw", () => {
	it("loads existing assets for read-only drawings", () => {
		const doc = new Doc();
		doc.getMap("assets").set("file-1", {
			dataURL: "data:image/png;base64,AA==",
		});

		render(
			<YjsExcalidraw locale="en" readOnly theme="light" yDoc={doc} />,
		);

		expect(screen.getByText("file-1")).toBeTruthy();
		doc.destroy();
	});
});
