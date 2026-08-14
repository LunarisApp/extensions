import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { downloadMock, uploadMock } = vi.hoisted(() => ({
	downloadMock: vi.fn(),
	uploadMock: vi.fn(),
}));

let canWriteContent = true;
let locale = "en";
let attachmentState: {
	attachment: null | {
		hasSynced: boolean;
		localUri: string | null;
		status: "queued-download" | "queued-upload" | "synced";
	};
	metadata: null | { filename: string };
	objectUrl: string | null;
};

vi.mock("@lunarisapp/plugin-sdk", () => ({
	ContentRendererReady: ({ children }: { children?: ReactNode }) => children,
	defineExternalContentType: (input: object) => ({
		...input,
		type: "content-type",
	}),
	defineExternalPlugin: (input: unknown) => input,
	useFileAttachment: () => attachmentState,
	useLocale: () => ({ locale }),
	useProjectItemName: () => "Budget",
	useUploadFileAttachment: () => uploadMock,
	useWorkspaceAccess: () => ({ canWriteContent }),
}));

vi.mock("@lunarisapp/ui/icons", () => ({
	AppWindowIcon: { body: "app" },
	Download01Icon: { body: "download" },
}));

import plugin, { miniAppContentType } from "./index";
import {
	buildMiniAppDocument,
	MINI_APP_CSP,
	MINI_APP_MAX_BYTES,
	MiniAppViewer,
} from "./mini-app-viewer";

describe("Mini Apps plugin", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		canWriteContent = true;
		locale = "en";
		attachmentState = { attachment: null, metadata: null, objectUrl: null };
		uploadMock.mockResolvedValue({ attachmentId: "att_1" });
	});

	it("registers an external document-less content type", () => {
		expect(plugin.manifest).toMatchObject({
			id: "lunaris.mini-app",
			sdk: "^0.0.4",
			version: "1.0.0",
		});
		expect(miniAppContentType).toMatchObject({
			createLabel: "Mini App",
			documentStorage: "none",
			id: "lunaris.mini-app",
			name: "Mini App",
			rendererSandbox: "local-srcdoc",
			type: "content-type",
		});
		expect(miniAppContentType.createMode).toBeUndefined();
	});

	it("shows onboarding and uploads one valid HTML file", async () => {
		render(<MiniAppViewer itemId="item_1" />);

		expect(
			screen.getByRole("heading", { name: "Bring your Mini App to life" }),
		).not.toBeNull();
		expect(
			screen.getByText(
				"Upload a self-contained HTML file with everything it needs—HTML, CSS, and JavaScript.",
			),
		).not.toBeNull();

		const input = screen.getByLabelText("Choose app") as HTMLInputElement;
		expect(input.accept).toBe(".html,.htm,text/html");
		expect(input.multiple).toBe(false);
		fireEvent.change(input, {
			target: { files: [new File(["<h1>Hello</h1>"], "report.htm")] },
		});

		await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
		const call = uploadMock.mock.calls[0]?.[0];
		expect(call.itemId).toBe("item_1");
		expect(call.file.name).toBe("report.htm");
		expect(call.file.type).toBe("text/html");
	});

	it("does nothing when the picker is cancelled", () => {
		render(<MiniAppViewer itemId="item_1" />);
		fireEvent.change(screen.getByLabelText("Choose app"), {
			target: { files: [] },
		});
		expect(uploadMock).not.toHaveBeenCalled();
	});

	it("disables upload without write permission", () => {
		canWriteContent = false;
		render(<MiniAppViewer itemId="item_1" />);

		expect(
			(screen.getByRole("button", { name: "Choose app" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(screen.getByLabelText("Choose app") as HTMLInputElement).disabled,
		).toBe(true);
	});

	it("shows localized validation and upload failures inline", async () => {
		render(<MiniAppViewer itemId="item_1" />);
		const input = screen.getByLabelText("Choose app");

		fireEvent.change(input, {
			target: {
				files: [new File(["no"], "notes.txt", { type: "text/plain" })],
			},
		});
		expect((await screen.findByRole("alert")).textContent).toContain(
			"Choose an HTML file",
		);

		const oversized = new File(
			[new Uint8Array(MINI_APP_MAX_BYTES + 1)],
			"large.html",
			{ type: "text/html" },
		);
		fireEvent.change(input, { target: { files: [oversized] } });
		expect((await screen.findByRole("alert")).textContent).toContain(
			"Mini Apps must be 5 MB or smaller",
		);

		uploadMock.mockRejectedValueOnce(new Error("offline"));
		fireEvent.change(input, {
			target: { files: [new File(["ok"], "app.html", { type: "text/html" })] },
		});
		expect((await screen.findByRole("alert")).textContent).toContain(
			"Mini App upload failed",
		);
	});

	it("shows pending state during upload", async () => {
		let resolveUpload: (() => void) | undefined;
		uploadMock.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveUpload = () => resolve({ attachmentId: "att_1" });
			}),
		);
		render(<MiniAppViewer itemId="item_1" />);
		fireEvent.change(screen.getByLabelText("Choose app"), {
			target: { files: [new File(["ok"], "app.html", { type: "text/html" })] },
		});

		expect(
			(await screen.findByRole("button", {
				name: "Uploading…",
			})) as HTMLButtonElement,
		).toHaveProperty("disabled", true);
		resolveUpload?.();
		await waitFor(() =>
			expect(
				(
					screen.getByRole("button", {
						name: "Choose app",
					}) as HTMLButtonElement
				).disabled,
			).toBe(false),
		);
	});

	it("reactively transitions to the sandboxed app", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response("<button>Run</button>"))),
		);
		const view = render(<MiniAppViewer itemId="item_1" />);
		expect(screen.getByRole("button", { name: "Choose app" })).not.toBeNull();

		attachmentState = {
			attachment: { hasSynced: true, localUri: "local", status: "synced" },
			metadata: { filename: "app.html" },
			objectUrl: "blob:app",
		};
		view.rerender(<MiniAppViewer itemId="item_1" />);

		expect(await screen.findByTitle("Budget Mini App")).not.toBeNull();
		expect(screen.queryByRole("button", { name: "Choose app" })).toBeNull();
	});

	it("renders source with the inner sandbox policy and attributes", async () => {
		attachmentState = {
			attachment: { hasSynced: true, localUri: "local", status: "synced" },
			metadata: { filename: "app.html" },
			objectUrl: "blob:app",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(() =>
				Promise.resolve(
					new Response("<script>document.body.textContent='ok'</script>"),
				),
			),
		);

		render(<MiniAppViewer itemId="item_1" />);
		const frame = (await screen.findByTitle(
			"Budget Mini App",
		)) as HTMLIFrameElement;

		expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
		expect(frame.referrerPolicy).toBe("no-referrer");
		expect(frame.getAttribute("allow")).toContain("camera 'none'");
		expect(frame.getAttribute("allow")).toContain("fullscreen 'none'");
		expect(frame.srcdoc).toContain(MINI_APP_CSP);
		expect(frame.srcdoc).toContain("document.body.textContent='ok'");
	});

	it("injects CSP before uploaded head content", () => {
		const result = buildMiniAppDocument(
			"<html><head><script>window.loaded=true</script></head></html>",
		);
		const document = new DOMParser().parseFromString(result, "text/html");

		expect(document.head.firstElementChild?.getAttribute("http-equiv")).toBe(
			"Content-Security-Policy",
		);
		expect(document.head.firstElementChild?.getAttribute("content")).toBe(
			MINI_APP_CSP,
		);
		expect(MINI_APP_CSP).toContain("connect-src 'none'");
	});

	it.each(["", "<main><p>Unclosed"])(
		"safely prepares empty or malformed HTML %#",
		(source) => {
			const document = new DOMParser().parseFromString(
				buildMiniAppDocument(source),
				"text/html",
			);
			expect(document.head.firstElementChild?.getAttribute("http-equiv")).toBe(
				"Content-Security-Policy",
			);
		},
	);

	it.each([
		["queued-download", null, "Downloading Mini App"],
		["synced", "local", "Mini App source is unavailable"],
	] as const)(
		"shows the source state for %s attachments",
		(status, localUri, title) => {
			attachmentState = {
				attachment: { hasSynced: true, localUri, status },
				metadata: { filename: "app.html" },
				objectUrl: null,
			};
			render(<MiniAppViewer itemId="item_1" />);
			expect(screen.getByRole("alert").textContent).toContain(title);
		},
	);

	it("uses bundled renderer translations", () => {
		locale = "de-DE";
		render(<MiniAppViewer itemId="item_1" />);
		expect(
			screen.getByRole("heading", {
				name: "Erwecken Sie Ihre Mini-App zum Leben",
			}),
		).not.toBeNull();
	});

	it("offers the generic source download action without replacement", async () => {
		downloadMock.mockResolvedValue(true);
		miniAppContentType.actions?.[0]?.onClick?.({
			compileContext: {} as never,
			contentTypeId: "lunaris.mini-app",
			downloadFileAttachment: downloadMock,
			itemId: "item_1",
			openRightDockPanel: vi.fn(),
		});

		await waitFor(() => expect(downloadMock).toHaveBeenCalledWith("item_1"));
		expect(miniAppContentType.actions).toHaveLength(1);
	});
});
