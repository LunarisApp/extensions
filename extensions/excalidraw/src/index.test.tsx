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
			{excalidrawView.renderer({
				params: {},
				resource: {
					documentId: "document-1",
					parentId: null,
					resourceId: "resource-1",
					resourceTypeId: "lunaris.excalidraw",
					schemaId: EXCALIDRAW_SCHEMA_ID,
					schemaVersion: 1,
					storageKind: "yjs",
				},
				storage: { documentId: "document-1", kind: "yjs" },
			})}
		</>,
	);
}

function renderStatusBar() {
	return excalidrawView.statusBar({
		params: {},
		resource: {
			documentId: "document-1",
			parentId: null,
			resourceId: "resource-1",
			resourceTypeId: "lunaris.excalidraw",
			schemaId: EXCALIDRAW_SCHEMA_ID,
			schemaVersion: 1,
			storageKind: "yjs",
		},
		storage: { documentId: "document-1", kind: "yjs" },
	});
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
		expect(excalidrawExtension.manifest.api).toBe("^0.5.0");
		expect(excalidrawResourceType).toMatchObject({
			defaultViewId: "lunaris.excalidraw",
			resourceTypeId: "lunaris.excalidraw",
			storage: { kind: "yjs" },
		});
		expect(excalidrawView).toMatchObject({
			statusBar: expect.any(Function),
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
		const locales = vi.fn();
		excalidrawExtension.activate({
			contributions: { locales, representation, resourceType, view },
		} as never);

		expect(resourceType).toHaveBeenCalledWith(excalidrawResourceType);
		expect(view).toHaveBeenCalledWith(excalidrawView);
		expect(representation).toHaveBeenCalledWith(excalidrawRepresentation);
		expect(locales).toHaveBeenCalledOnce();
	});

	it("reads and validates the existing elements/assets document shape", async () => {
		const asset = { dataURL: "data:image/png;base64,AA==" };
		state.elements = [{ id: "element-1", isDeleted: false }];
		const payload = await excalidrawResourceType.schema.read({
			document: testYDoc(new Map([["file-1", asset]])) as never,
			documentId: "document-1",
			resourceId: "resource-1",
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
						documentId: "document-1",
						parentId: null,
						resourceId: "resource-1",
						resourceTypeId: "lunaris.excalidraw",
						schemaId: EXCALIDRAW_SCHEMA_ID,
						schemaVersion: 1,
						storageKind: "yjs",
					},
					storage: { documentId: "document-1", kind: "yjs" },
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
		await expect(
			excalidrawRepresentation.getContent("document-1", {} as never),
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

		const compiled = await excalidrawRepresentation.getContent(
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
