import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	EXCALIDRAW_SCHEMA_ID,
	excalidrawExtension,
	excalidrawRepresentation,
	excalidrawResourceType,
	excalidrawSceneSchema,
	excalidrawView,
} from "./index";
import {
	excalidrawSearchIndexer,
	extractExcalidrawSearchText,
} from "./search-indexer";

const state = vi.hoisted(() => ({
	canWriteContent: true,
	elements: [] as Array<{ id?: string; isDeleted?: boolean }>,
	error: null as Error | null,
	exportToBlob: vi.fn(),
	isLoading: false,
	locale: "en",
	yDoc: null as {
		getArray: () => object;
		getMap: () => Map<string, unknown>;
	} | null,
}));
const YJS_STORAGE = { kind: "yjs", storageId: "yjs-storage-1" } as const;

vi.mock("@excalidraw/excalidraw", () => ({
	exportToBlob: state.exportToBlob,
}));
vi.mock("@lunarisapp/plugin-sdk", () => ({
	ViewReady: ({
		children,
		reportReady,
	}: {
		children?: ReactNode;
		reportReady?: () => void;
	}) => {
		reportReady?.();
		return children;
	},
	definePlugin: (input: unknown) => input,
	useLocale: () => ({ locale: state.locale }),
	useWorkspaceAccess: () => ({ canWriteContent: state.canWriteContent }),
}));
vi.mock("@lunarisapp/plugin-sdk/compile", () => ({
	withYjsDoc: vi.fn(async (_context, _storage, run, empty) =>
		state.yDoc ? run(state.yDoc) : empty,
	),
}));
vi.mock("@lunarisapp/plugin-sdk/data", () => ({
	useYjsStorage: () => ({
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
			{excalidrawView.renderer({
				params: {},
				resource: {
					parentId: null,
					resourceId: "resource-1",
					resourceTypeId: "lunaris.excalidraw",
					schemaId: EXCALIDRAW_SCHEMA_ID,
					schemaVersion: 1,
				},
				storage: { content: YJS_STORAGE },
			})}
		</>,
	);
}

function renderStatusBar() {
	return excalidrawView.statusBar({
		params: {},
		resource: {
			parentId: null,
			resourceId: "resource-1",
			resourceTypeId: "lunaris.excalidraw",
			schemaId: EXCALIDRAW_SCHEMA_ID,
			schemaVersion: 1,
		},
		storage: { content: YJS_STORAGE },
	});
}

function testCompileContext() {
	return {
		getProjectResource: vi.fn(() =>
			Promise.resolve({ storage: { content: YJS_STORAGE } }),
		),
	};
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
	it("registers the stable resource type and compatible default view", () => {
		expect(excalidrawExtension.manifest.id).toBe("lunaris.excalidraw");
		expect(excalidrawExtension.manifest.api).toBe("^0.7.0");
		expect(excalidrawExtension.manifest.version).toBe("0.0.1");
		expect(excalidrawExtension.manifest.permissions).toContain("content.read");
		expect(excalidrawResourceType).toMatchObject({
			defaultViewId: "lunaris.excalidraw",
			resourceTypeId: "lunaris.excalidraw",
			storage: { content: { kind: "yjs" } },
		});
		expect(excalidrawView).toMatchObject({
			statusBar: expect.any(Function),
			storageRequirements: { content: "yjs" },
			target: { kind: "resource", resourceTypeIds: ["lunaris.excalidraw"] },
			viewId: excalidrawResourceType.defaultViewId,
		});
		expect(excalidrawSceneSchema.safeParse({ assets: {}, elements: [{}] }).success).toBe(true);
		expect(excalidrawSceneSchema.safeParse({ assets: [], elements: {} }).success).toBe(false);
	});

	it("registers contributions during activation", () => {
		const resourceType = vi.fn();
		const view = vi.fn();
		const representation = vi.fn();
		const searchIndexer = vi.fn();
		const locales = vi.fn();
		excalidrawExtension.activate({
			contributions: {
				locales,
				representation,
				resourceType,
				searchIndexer,
				view,
			},
		} as never);

		expect(resourceType).toHaveBeenCalledWith(excalidrawResourceType);
		expect(view).toHaveBeenCalledWith(excalidrawView);
		expect(representation).toHaveBeenCalledWith(excalidrawRepresentation);
		expect(searchIndexer).toHaveBeenCalledOnce();
		expect(searchIndexer).toHaveBeenCalledWith(excalidrawSearchIndexer);
		expect(excalidrawSearchIndexer).toMatchObject({
			id: "lunaris.excalidraw.search-indexer",
			resourceTypeIds: ["lunaris.excalidraw"],
		});
		expect(locales).toHaveBeenCalledOnce();
	});

	it("extracts visible labels in reading order as normalized plain text", () => {
		expect(
			extractExcalidrawSearchText({
				assets: { binary: "data:image/png;base64,AA==" },
				elements: [
					{
						originalText: "Second   label",
						text: "Second label",
						type: "text",
						x: 10,
						y: 80,
					},
					{
						name: "<strong>Planning</strong> frame",
						type: "frame",
						x: 0,
						y: 0,
					},
					{ originalText: "First\r\nlabel", type: "text", x: 10, y: 40 },
					{ originalText: "First\nlabel", type: "text", x: 20, y: 60 },
					{ originalText: "Budget < 5 > actual", type: "text", x: 10, y: 100 },
				],
			}),
		).toBe("Planning frame\nFirst\nlabel\nSecond label\nBudget < 5 > actual");
	});

	it("returns null for malformed, empty, deleted, hidden, and structural-only scenes", () => {
		expect(extractExcalidrawSearchText(null)).toBeNull();
		expect(extractExcalidrawSearchText({ elements: "not-an-array" })).toBeNull();
		expect(
			extractExcalidrawSearchText({
				assets: {},
				elements: [
					{ originalText: "Deleted", isDeleted: true, type: "text" },
					{ isGenerated: true, text: "Generated", type: "text" },
					{ hidden: true, text: "Hidden", type: "text" },
					{ height: 20, type: "rectangle", width: 40 },
					{
						text: "data:text/plain;charset=utf-8;base64,SGVsbG8=",
						type: "text",
					},
				],
			}),
		).toBeNull();
	});

	it("reads and validates the existing elements/assets document shape", async () => {
		const asset = { dataURL: "data:image/png;base64,AA==" };
		state.elements = [{ id: "element-1", isDeleted: false }];
		const payload = await excalidrawResourceType.schema.read({
			resourceId: "resource-1",
			storage: {
				content: {
					document: testYDoc(new Map([["file-1", asset]])) as never,
					kind: "yjs",
				},
			},
		});
		expect(payload).toEqual({
			assets: { "file-1": asset },
			elements: state.elements,
		});
		expect(excalidrawSceneSchema.safeParse(payload).success).toBe(true);
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
		expect(document.querySelector(".excalidraw-shell")?.getAttribute("data-color-scheme")).toBe(
			"dark",
		);
	});

	it("reports readiness after the document loads", () => {
		const reportReady = vi.fn();
		state.yDoc = testYDoc();
		render(
			<>
				{excalidrawView.renderer({
					params: {},
					reportReady,
					resource: {
						parentId: null,
						resourceId: "resource-1",
						resourceTypeId: "lunaris.excalidraw",
						schemaId: EXCALIDRAW_SCHEMA_ID,
						schemaVersion: 1,
					},
					storage: { content: YJS_STORAGE },
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
				{renderStatusBar()}
			</>,
		);
		expect(screen.getByText("2 elements")).toBeTruthy();
		expect(screen.getByText("2 elements").classList.contains("excalidraw-statusbar")).toBe(true);
	});

	it("keeps the status bar mounted while its document is reacquired", () => {
		state.yDoc = testYDoc();
		state.elements = [{}];
		const statusBar = () => (
			<>
				{renderStatusBar()}
			</>
		);
		const view = render(statusBar());
		expect(screen.getByText("1 element")).toBeTruthy();
		view.unmount();

		state.isLoading = true;
		state.yDoc = null;
		const reacquiredView = render(statusBar());
		expect(screen.getByText("Excalidraw").classList.contains("excalidraw-statusbar")).toBe(true);

		state.isLoading = false;
		state.yDoc = testYDoc();
		state.elements = [{}, {}];
		reacquiredView.rerender(statusBar());
		expect(screen.getByText("2 elements")).toBeTruthy();
	});

	it("returns empty compile content for an empty drawing", async () => {
		state.yDoc = testYDoc();
		const context = testCompileContext();
		await expect(
			excalidrawRepresentation.getContent("resource-1", context as never),
		).resolves.toEqual({ sections: [], title: "" });
		expect(context.getProjectResource).toHaveBeenCalledWith("resource-1");
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

		const context = testCompileContext();
		const compiled = await excalidrawRepresentation.getContent(
			"resource-1",
			context as never,
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
