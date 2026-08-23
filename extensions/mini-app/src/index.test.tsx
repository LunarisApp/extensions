import {
	PLUGIN_SANDBOX_BOOTSTRAP_CSP,
	PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
} from "@lunarisapp/plugin-sdk";
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
let storedFileState: {
	file: null | {
		hasSynced: boolean;
		id: string;
		localUri: string | null;
		status: "queued-download" | "queued-upload" | "synced";
	};
	metadata: null | { filename: string };
	objectUrl: string | null;
};

vi.mock("@lunarisapp/plugin-sdk", () => ({
	ContentRendererReady: ({ children }: { children?: ReactNode }) => children,
	PLUGIN_SANDBOX_BOOTSTRAP_CSP:
		"'sha256-fCaVxzn99NXIV2Sj1rVbVZxfp8DmlTnAEsbUyIxGxjg='",
	PLUGIN_SANDBOX_BOOTSTRAP_SOURCE:
		'if(origin!=="null")throw new Error("Sandbox bootstrap requires an opaque origin");const decode=id=>Uint8Array.from(atob(document.getElementById(id)?.textContent||""),value=>value.charCodeAt(0));const style=document.createElement("style");style.textContent=new TextDecoder().decode(decode("lunaris-plugin-style"));document.head.append(style);const scriptUrl=URL.createObjectURL(new Blob([decode("lunaris-plugin-script")],{type:"text/javascript"}));const script=document.createElement("script");script.src=scriptUrl;script.onload=script.onerror=()=>URL.revokeObjectURL(scriptUrl);document.head.append(script);',
	definePlugin: (input: unknown) => input,
	useFileStorage: () => ({ download: downloadMock, upload: uploadMock }),
	useLocale: () => ({ locale }),
	useProjectItemName: () => "Budget",
	useStoredFile: () => storedFileState,
	useWorkspaceAccess: () => ({ canWriteContent }),
}));

vi.mock("@lunarisapp/ui/icons", () => ({
	AppWindowIcon: { body: "app" },
	Download01Icon: { body: "download" },
}));

import extension, { miniAppContentType } from "./index";
import {
	buildMiniAppDocument,
	MINI_APP_CSP,
	MINI_APP_MAX_BYTES,
	MiniAppViewer,
} from "./mini-app-viewer";

describe("Mini Apps extension", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		canWriteContent = true;
		locale = "en";
		storedFileState = { file: null, metadata: null, objectUrl: null };
		uploadMock.mockResolvedValue({ fileId: "att_1" });
	});

	it("registers an external document-less content type", () => {
		expect(extension.manifest).toMatchObject({
			api: "^0.3.0",
			id: "lunaris.mini-app",
			version: "1.0.7",
		});
		expect(miniAppContentType).toMatchObject({
			documentStorage: "none",
			id: "lunaris.mini-app",
			name: "Mini App",
			rendererSandbox: "local-srcdoc",
		});
	});

	it("registers contributions during activation", () => {
		const contentType = vi.fn();
		const locales = vi.fn();
		extension.activate({
			contributions: { contentType, locales },
		} as never);

		expect(contentType).toHaveBeenCalledWith(miniAppContentType);
		expect(locales).toHaveBeenCalledOnce();
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
				resolveUpload = () => resolve({ fileId: "att_1" });
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

		storedFileState = {
			file: {
				hasSynced: true,
				id: "att_1",
				localUri: "local",
				status: "synced",
			},
			metadata: { filename: "app.html" },
			objectUrl: "blob:app",
		};
		view.rerender(<MiniAppViewer itemId="item_1" />);

		expect(await screen.findByTitle("Budget Mini App")).not.toBeNull();
		expect(screen.queryByRole("button", { name: "Choose app" })).toBeNull();
	});

	it("renders source with the inner sandbox policy and attributes", async () => {
		storedFileState = {
			file: {
				hasSynced: true,
				id: "att_1",
				localUri: "local",
				status: "synced",
			},
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
		expect(frame.srcdoc).toContain("data-lunaris-mini-app-script");
	});

	it("keeps the app mounted when the sandbox rotates its object URL", async () => {
		storedFileState = {
			file: {
				hasSynced: true,
				id: "att_1",
				localUri: "local",
				status: "synced",
			},
			metadata: { filename: "app.html" },
			objectUrl: "blob:first",
		};
		const fetchMock = vi.fn(() =>
			Promise.resolve(new Response("<main>Stable</main>")),
		);
		vi.stubGlobal("fetch", fetchMock);

		const view = render(<MiniAppViewer itemId="item_1" />);
		const frame = await screen.findByTitle("Budget Mini App");

		storedFileState = { ...storedFileState, objectUrl: "blob:second" };
		view.rerender(<MiniAppViewer itemId="item_1" />);

		expect(await screen.findByTitle("Budget Mini App")).toBe(frame);
		expect(fetchMock).toHaveBeenCalledTimes(1);
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
		expect(MINI_APP_CSP).toContain(
			`script-src blob: ${PLUGIN_SANDBOX_BOOTSTRAP_CSP}`,
		);
		expect(MINI_APP_CSP).not.toContain("script-src 'unsafe-inline'");
	});

	it("loads uploaded inline scripts through CSP-approved blob URLs", () => {
		const result = buildMiniAppDocument(
			'<script id="app" type="text/javascript">window.loaded = "✓"</script>',
		);
		const document = new DOMParser().parseFromString(result, "text/html");
		const placeholder = document.querySelector(
			"script[data-lunaris-mini-app-script]",
		);
		const bootstrap = Array.from(document.scripts).find(
			(script) => script.textContent === PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
		);

		expect(placeholder?.getAttribute("type")).toBe("application/octet-stream");
		expect(placeholder?.getAttribute("data-lunaris-mini-app-script")).toBe(
			"text/javascript",
		);
		expect(
			new TextDecoder().decode(
				Uint8Array.from(atob(placeholder?.textContent ?? ""), (character) =>
					character.charCodeAt(0),
				),
			),
		).toBe('window.loaded = "✓"');
		expect(document.querySelector("#lunaris-plugin-script")).not.toBeNull();
		expect(bootstrap).not.toBeUndefined();
	});

	it("preserves data scripts and replaces uploaded CSP", () => {
		const result = buildMiniAppDocument(
			'<meta http-equiv="Content-Security-Policy" content="script-src *"><script type="application/json">{"ok":true}</script>',
		);
		const document = new DOMParser().parseFromString(result, "text/html");
		const policies = document.querySelectorAll(
			'meta[http-equiv="Content-Security-Policy"]',
		);
		const dataScript = document.querySelector(
			'script[type="application/json"]',
		);

		expect(policies).toHaveLength(1);
		expect(policies[0]?.getAttribute("content")).toBe(MINI_APP_CSP);
		expect(dataScript?.textContent).toBe('{"ok":true}');
		expect(dataScript?.hasAttribute("data-lunaris-mini-app-script")).toBe(
			false,
		);
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
		"shows the source state for %s files",
		(status, localUri, title) => {
			storedFileState = {
				file: { hasSynced: true, id: "att_1", localUri, status },
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
			fileStorage: { download: downloadMock },
			itemId: "item_1",
			openRightDockPanel: vi.fn(),
		});

		await waitFor(() => expect(downloadMock).toHaveBeenCalledWith("item_1"));
		expect(miniAppContentType.actions).toHaveLength(1);
	});
});
