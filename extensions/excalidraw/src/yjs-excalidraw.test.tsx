import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

	it("waits for writable document updates to persist", async () => {
		const doc = new Doc();
		const waitForPersistence = vi.fn().mockResolvedValue(undefined);

		render(
			<YjsExcalidraw
				locale="en"
				persistence={{
					getPersistenceState: () => "idle",
					subscribePersistenceState: () => () => undefined,
					waitForPersistence,
				}}
				theme="light"
				yDoc={doc}
			/>,
		);

		doc.transact(() => doc.getMap("metadata").set("loaded", true), "host");
		await Promise.resolve();
		expect(waitForPersistence).not.toHaveBeenCalled();

		doc.getMap("metadata").set("updated", true);
		await waitFor(() => expect(waitForPersistence).toHaveBeenCalledOnce());
		doc.destroy();
	});
});
