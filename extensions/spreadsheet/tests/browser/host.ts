import * as Y from "yjs";
import { Workbook, initializeWorkbook, cellKey } from "../../src/model";
import { parseFormula } from "../../src/formulas";
const doc = new Y.Doc();
const book = new Workbook(doc);
const query = new URLSearchParams(location.search);
const rows = Number(query.get("rows") || 100);
if (rows === 100) {
	initializeWorkbook(doc);
	book.transact(() => {
		const s = book.list()[0];
		s.setInput(0, 0, 10);
		s.setInput(0, 1, 20);
		s.setInput(0, 2, parseFormula("=A1+B1", book, s));
	});
} else
	doc.transact(() => {
		book.metadata.set("version", 1);
		book.metadata.set("name", "Benchmark");
		const s = book.addSheet("Data", rows, 20);
		s.data.get("baseRows").push(s.axis("rows").active);
		s.inputs.importOrdered(
			(function* () {
				for (let r = 0; r < rows; r++)
					for (let c = 0; c < 20; c++)
						yield [
							cellKey(s.axis("rows").active[r], s.axis("columns").active[c]),
							c === 19 && r % 5 === 0
								? parseFormula(`=B${r + 1}+C${r + 1}`, book, s)
								: c % 3 === 0
									? `Row ${r}`
									: r + c,
						];
			})(),
		);
	});
if (query.get("scenario") === "formulas")
	book.transact(() => {
		const s = book.list()[0];
		s.setInput(0, 0, 2);
		s.setInput(1, 0, 4);
		s.setInput(0, 1, "Alpha");
		s.setInput(1, 1, "Beta");
		const other = book.addSheet("Other (FY26)");
		other.setInput(0, 0, 8);
		other.setInput(1, 0, parseFormula("=B2+C2", book, other));
		other.setInput(1, 1, parseFormula("=A2", book, other));
		other.setInput(1, 2, parseFormula("=B2", book, other));
		for (const [r, f] of [
			"=SUM(A1:A2)",
			"=IF(A1<A2,TRUE,FALSE)",
			"=VLOOKUP(4,A1:B2,2,FALSE)",
			"=DATE(2024,2,29)",
			"=YEAR(D4)",
			"=LEFT(B1,2)",
			"=1/0",
			"=D8",
			"='Other (FY26)'!A1+A1",
			'=INDIRECT("A1")',
			"='Other (FY26)'!C2",
		].entries())
			s.setInput(r, 3, parseFormula(f, book, s));
	});
const ports = [];
let revision = 0;
const downloads = [];
const calls = [];
Object.assign(window, {
	book,
	doc,
	ports,
	downloads,
	calls,
	ready: 0,
	failures: [],
	setCell: (r, c, v) => book.transact(() => book.list()[0].setInput(r, c, v)),
	getCell: (r, c) => book.list()[0].input(r, c),
});
const snapshot = () => ({
	access: { canWriteContent: !query.has("readonly"), canDeleteContent: true },
	api: { baseUrl: location.origin },
	currentWorkspace: {
		workspaceId: "workspace",
		workspace: { id: "workspace", name: "Test" },
	},
	currentUser: { user: { id: "tester", name: "Test" } },
	locale: "en",
	environment: {
		theme: "light",
		colorScheme: query.has("dark") ? "dark" : "light",
		cssVariables: query.has("dark")
			? {
					"--background": "#18181b",
					"--foreground": "#fafafa",
					"--border": "#3f3f46",
					"--muted": "#27272a",
					"--muted-foreground": "#a1a1aa",
				}
			: {},
	},
	members: { isLoading: false, items: [] },
	resources: [],
	workspaceChildren: [],
	resourceTrash: [],
	storage: { slots: {} },
	yjs: [
		{
			storageId: "content",
			workspaceId: "workspace",
			incremental: true,
			available: true,
			revision,
			persistenceState: query.has("save-error") ? "error" : "idle",
		},
	],
	lunarisContent: {
		activeResourceId: "resource",
		activeWorkspaceId: "workspace",
		activeStorage: { content: { kind: "yjs", storageId: "content" } },
	},
});
doc.on("updateV2", () => {
	revision++;
	for (const port of ports)
		port.postMessage({ type: "snapshot", id: "render", host: snapshot() });
});
for (let i = 0; i < Number(query.get("frames") || 2); i++) {
	const iframe = document.createElement("iframe");
	iframe.setAttribute("sandbox", "allow-scripts");
	iframe.style.cssText = "width:100%;height:720px;border:1px solid #ddd";
	iframe.src = "/frame";
	document.body.append(iframe);
	iframe.onload = () => {
		const channel = new MessageChannel();
		const port = channel.port1;
		let initializeHandler: string;
		let initializer:
			| {
					resolve: (value: ArrayBuffer) => void;
					reject: (error: Error) => void;
			  }
			| undefined;
		ports.push(port);
		port.onmessage = async ({ data: m }) => {
			if (m.id === "initialize-import" && initializer) {
				if (m.type === "result") initializer.resolve(m.value);
				if (m.type === "failure")
					initializer.reject(new Error(m.error.message));
			}
			if (m.type === "registered") {
				initializeHandler = m.definition.contributions.find(
					(c) => c.type === "resource-type",
				).storage.content.initializeHandler;
				window.registration = m;
				port.postMessage({ type: "activate", id: "activate" });
				const contribution = m.definition.contributions.find(
					(c) => c.type === "view",
				);
				port.postMessage({
					type: "render",
					id: "render",
					renderer: contribution.renderer,
					params: {
						resource: {
							resourceId: "resource",
							parentId: "root",
							resourceTypeId: "lunaris.spreadsheet",
							schemaId: "lunaris.spreadsheet.workbook",
							schemaVersion: 1,
						},
						storage: { content: { kind: "yjs", storageId: "content" } },
					},
					host: snapshot(),
				});
			}
			if (m.type === "failure" || m.type === "registration-failed") {
				window.failures.push(m);
				console.error(m);
			}
			if (m.type === "host-call") {
				calls.push({ method: m.method, size: m.args?.[1]?.byteLength });
				let value;
				try {
					if (m.method === "yjs.sync")
						value = {
							update: Y.encodeStateAsUpdateV2(doc, new Uint8Array(m.args[1]))
								.buffer,
							stateVector: Y.encodeStateVector(doc).buffer,
						};
					else if (m.method === "yjs.applyUpdate")
						Y.applyUpdateV2(doc, new Uint8Array(m.args[1]));
					else if (m.method === "renderer.reportReady") window.ready++;
					else if (m.method === "downloads.begin") value = "download";
					else if (m.method === "downloads.write") downloads.push(m.args[1]);
					else if (m.method === "resources.create") {
						const update = await new Promise<ArrayBuffer>((resolve, reject) => {
							initializer = { resolve, reject };
							port.postMessage({
								type: "invoke",
								id: "initialize-import",
								handler: initializeHandler,
								input: { initialPayload: m.args[0].initialPayload },
							});
						});
						initializer = undefined;
						const imported = new Y.Doc();
						Y.applyUpdateV2(imported, new Uint8Array(update));
						window.importedBook = new Workbook(imported);
						window.createdPayload = m.args[0];
						value = {
							name: m.args[0].name,
							resourceId: "new",
							storage: { content: { kind: "yjs", storageId: "new" } },
						};
					}
					port.postMessage({ type: "host-result", id: m.id, value });
				} catch (e) {
					port.postMessage({
						type: "host-result",
						id: m.id,
						error: { message: e.message, name: e.name },
					});
				}
			}
		};
		port.start();
		iframe.contentWindow.postMessage(
			{
				type: "lunaris-plugin-sandbox-connect",
				pluginId: "lunaris.spreadsheet",
			},
			"*",
			[channel.port2],
		);
	};
}
