import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { excalidrawContentType, excalidrawExtension } from "./index";

const state = vi.hoisted(() => ({
	canWriteContent: true,
	elements: [] as Array<{ isDeleted?: boolean }>,
	error: null as Error | null,
	exportToBlob: vi.fn(),
	isLoading: false,
	locale: "en",
	yDoc: null as {
		getArray: () => object;
		getMap: () => Map<string, unknown>;
	} | null,
}));

vi.mock("@excalidraw/excalidraw", () => ({
	exportToBlob: state.exportToBlob,
}));
vi.mock("@lunarisapp/plugin-sdk", () => ({
	ContentRendererReady: ({
		children,
		reportReady,
	}: {
		children?: ReactNode;
		reportReady?: () => void;
	}) => {
		reportReady?.();
		return children;
	},
	defineExternalContentType: (input: object) => ({
		...input,
		type: "content-type",
	}),
	defineExternalPlugin: (input: unknown) => input,
	useLocale: () => ({ locale: state.locale }),
	useWorkspaceAccess: () => ({ canWriteContent: state.canWriteContent }),
}));
vi.mock("@lunarisapp/plugin-sdk/compile", () => ({
	withYjsDoc: vi.fn(async (_context, _documentId, run, empty) =>
		state.yDoc ? run(state.yDoc) : empty,
	),
}));
vi.mock("@lunarisapp/plugin-sdk/data", () => ({
	useCurrentProjectYjsDocument: () => ({
		error: state.error,
		isLoading: state.isLoading,
		yDoc: state.yDoc,
	}),
	useYArray: vi.fn(),
}));
vi.mock("y-excalidraw", () => ({
	yjsToExcalidraw: vi.fn(() => state.elements),
}));
vi.mock("./yjs-excalidraw", () => ({
	YjsExcalidraw: ({
		locale,
		readOnly,
		theme,
	}: {
		locale: string;
		readOnly: boolean;
		theme: string;
	}) => <div>{`editor:${theme}:${locale}:${readOnly ? "read" : "write"}`}</div>,
}));

function renderContent() {
	render(
		<>
			{excalidrawContentType.renderer({
				documentId: "document-1",
				params: {},
			})}
		</>,
	);
}

function testYDoc(assets = new Map<string, unknown>()) {
	return { getArray: () => ({}), getMap: () => assets };
}

afterEach(() => {
	cleanup();
	document.documentElement.style.colorScheme = "";
	state.canWriteContent = true;
	state.elements = [];
	state.error = null;
	state.isLoading = false;
	state.locale = "en";
	state.yDoc = null;
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe("Excalidraw external extension", () => {
	it("registers the stable content type", () => {
		expect(excalidrawExtension.manifest.id).toBe("lunaris.excalidraw");
		expect(excalidrawContentType).toMatchObject({
			compilable: true,
			documentStorage: "yjs",
			id: "lunaris.excalidraw",
			type: "content-type",
		});
	});

	it("shows a local skeleton while the Yjs document loads", () => {
		state.isLoading = true;
		state.yDoc = testYDoc();
		renderContent();
		expect(screen.getByTestId("excalidraw-skeleton")).toBeTruthy();
	});

	it("shows local errors and missing-document states", () => {
		state.error = new Error("Malformed update");
		renderContent();
		expect(screen.getByText("Error loading Excalidraw")).toBeTruthy();
		expect(screen.getByText("Malformed update")).toBeTruthy();
		cleanup();

		state.error = null;
		renderContent();
		expect(screen.getByText("Excalidraw not found")).toBeTruthy();
	});

	it("passes permissions, locale, and mirrored theme to the editor", async () => {
		state.canWriteContent = false;
		state.locale = "fr";
		state.yDoc = testYDoc();
		renderContent();
		expect(screen.getByText("editor:light:fr:read")).toBeTruthy();

		document.documentElement.style.colorScheme = "dark";
		await waitFor(() => {
			expect(screen.getByText("editor:dark:fr:read")).toBeTruthy();
		});
	});

	it("reports readiness after the document loads", () => {
		const reportReady = vi.fn();
		state.yDoc = testYDoc();
		render(
			<>
				{excalidrawContentType.renderer({
					documentId: "document-1",
					params: {},
					reportReady,
				})}
			</>,
		);

		expect(reportReady).toHaveBeenCalledOnce();
	});

	it("counts only visible scene elements", () => {
		state.yDoc = testYDoc();
		state.elements = [{}, { isDeleted: true }, { isDeleted: false }];
		render(
			<>
				{excalidrawContentType.statusBar?.({
					contentTypeId: "lunaris.excalidraw",
					documentId: "document-1",
				})}
			</>,
		);
		expect(screen.getByText("2 elements")).toBeTruthy();
	});

	it("returns empty compile content for an empty drawing", async () => {
		state.yDoc = testYDoc();
		await expect(
			excalidrawContentType.getCompileContent?.("document-1", {} as never),
		).resolves.toEqual({ sections: [], title: "" });
	});

	it("compiles visible elements to an image section", async () => {
		const file = {
			dataURL: "data:image/png;base64,AA==",
			id: "file-1",
			mimeType: "image/png",
		};
		state.yDoc = testYDoc(new Map([[file.id, file]]));
		state.elements = [{ isDeleted: false }];
		state.exportToBlob.mockResolvedValue(
			new Blob(["drawing"], { type: "image/png" }),
		);
		vi.stubGlobal(
			"Image",
			class {
				height = 240;
				onerror?: () => void;
				onload?: () => void;
				width = 320;

				set src(_value: string) {
					this.onload?.();
				}
			},
		);

		const compiled = await excalidrawContentType.getCompileContent?.(
			"document-1",
			{} as never,
		);

		expect(state.exportToBlob).toHaveBeenCalledWith(
			expect.objectContaining({
				files: { "file-1": file },
				maxWidthOrHeight: 800,
			}),
		);
		expect(compiled).toEqual({
			sections: [
				{
					dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
					height: 240,
					type: "image",
					width: 320,
				},
			],
			title: "",
		});
	});
});
