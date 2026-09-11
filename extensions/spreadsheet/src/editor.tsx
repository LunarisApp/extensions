import {
	useCurrentWorkspace,
	useDownloads,
	useOrganizationAccess,
	useOrganizationNavigation,
	useWorkspaceResourceActions,
	ViewReady,
	type JsonObject,
	type ResourceViewProps,
} from "@lunarisapp/plugin-sdk";
import { useYjsStorage } from "@lunarisapp/plugin-sdk/data";
import { runPluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";
import { CellValueType } from "@univerjs/core";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { SpreadsheetAdapter } from "./adapter";
import { createEngine, type Engine } from "./engine";
import type {
	ConversionTask,
	ExportFormat,
	ExportResult,
	ImportPreview,
} from "./formats";
import { type Scalar, splitCellKey } from "./model";
import ConversionWorker from "./conversion.worker?worker&inline";
import { LIMITS } from "./limits";
import { abortable } from "./cancellation";
import "./styles.css";
const formats: Array<[ExportFormat, string]> = [
	["xlsx", "Excel (.xlsx)"],
	["ods", "OpenDocument (.ods)"],
	["csv", "CSV · active sheet"],
	["tsv", "TSV · active sheet"],
	["json", "JSON records · active sheet"],
	["native", "Native workbook · full backup"],
];
export function SpreadsheetEditor({
	storage,
	resource,
	reportReady,
}: ResourceViewProps) {
	const { yDoc, yProvider, error, isLoading } = useYjsStorage(storage.content);
	const { canWriteContent } = useOrganizationAccess();
	const downloads = useDownloads();
	const actions = useWorkspaceResourceActions();
	const navigation = useOrganizationNavigation();
	const { workspaceId } = useCurrentWorkspace();
	const fileMenuId = useId();
	const fileMenu = useRef<HTMLDivElement>(null);
	const fileButton = useRef<HTMLButtonElement>(null);
	const importPanel = useRef<HTMLElement>(null);
	const wasImportOpen = useRef(false);
	const container = useRef<HTMLDivElement>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const active = useRef<
		{ adapter: SpreadsheetAdapter; engine: Engine } | undefined
	>(undefined);
	const controller = useRef<AbortController | undefined>(undefined);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState("");
	const [ready, setReady] = useState(false);
	const [calculating, setCalculating] = useState(true);
	const [needsRecovery, setNeedsRecovery] = useState(false);
	const [file, setFile] = useState<File>();
	const [preview, setPreview] = useState<ImportPreview>();
	const [delimiter, setDelimiter] = useState(",");
	const [types, setTypes] = useState<"text" | "infer">("infer");
	const [header, setHeader] = useState(true);
	const [format, setFormat] = useState<ExportFormat>("xlsx");
	const [persistence, setPersistence] = useState("idle");
	const [warnings, setWarnings] = useState<string[]>([]);
	useEffect(() => {
		if (!yDoc || !container.current) return;
		setReady(false);
		try {
			const engine = createEngine(container.current);
			const adapter = new SpreadsheetAdapter(
				engine,
				yDoc,
				!canWriteContent,
				setMessage,
				setNeedsRecovery,
			);
			active.current = { engine, adapter };
			let disposed = false;
			setCalculating(true);
			let paint = 0;
			const painted = () => {
				if (disposed) return;
				const canvas = container.current?.querySelector<HTMLCanvasElement>(
					'canvas[id^="univer-sheet-main-canvas_"]',
				);
				if (canvas && canvas.width > 0 && canvas.height > 0)
					paint = requestAnimationFrame(() => {
						if (!disposed) setReady(true);
					});
				else paint = requestAnimationFrame(painted);
			};
			paint = requestAnimationFrame(painted);
			const calculationStart = engine.univerAPI
				.getFormula()
				.calculationStart(() => setCalculating(true));
			const calculationEnd = engine.univerAPI
				.getFormula()
				.calculationResultApplied(() => setCalculating(false));
			void engine.univerAPI
				.getFormula()
				.onCalculationResultApplied(30_000)
				.then(() => {
					if (!disposed) setCalculating(false);
				})
				.catch((error) => {
					if (!disposed)
						setMessage(`Initial calculation failed: ${String(error)}`);
				});
			let darkMode: boolean | undefined;
			const theme = () => {
				const next =
					document.documentElement.style.colorScheme === "dark" ||
					document.documentElement.classList.contains("dark");
				if (next !== darkMode) {
					darkMode = next;
					engine.univerAPI.toggleDarkMode(next);
				}
			};
			theme();
			const observer = new MutationObserver(theme);
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["class", "style"],
			});
			return () => {
				disposed = true;
				cancelAnimationFrame(paint);
				calculationStart.dispose();
				calculationEnd.dispose();
				observer.disconnect();
				adapter.dispose();
				engine.dispose();
				active.current = undefined;
			};
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		}
	}, [yDoc, canWriteContent]);
	useEffect(() => () => controller.current?.abort(), []);
	useLayoutEffect(() => {
		if (file) importPanel.current?.focus();
		else if (wasImportOpen.current) {
			// Chromium can retain a non-editable state in Univer's hidden inputs
			// after text scaling while inert. Refresh their existing editability
			// after removing inert, without changing content or moving focus.
			container.current
				?.querySelectorAll<HTMLElement>(
					'[data-u-comp="editor"][contenteditable="true"]',
				)
				.forEach((editor) => {
					editor.contentEditable = "false";
					editor.contentEditable = "true";
				});
		}
		wasImportOpen.current = !!file;
	}, [file]);
	function closeImport() {
		setFile(undefined);
		setPreview(undefined);
		setMessage("");
		fileButton.current?.focus();
	}
	useEffect(() => {
		if (!yProvider) return;
		const update = () => setPersistence(yProvider.getPersistenceState());
		update();
		return yProvider.subscribePersistenceState(update);
	}, [yProvider]);
	async function task<T>(
		input: ConversionTask,
		label: string,
	): Promise<T | undefined> {
		controller.current?.abort();
		const abort = new AbortController();
		controller.current = abort;
		setBusy(label);
		setMessage("");
		try {
			return await runPluginWorkerTask<ConversionTask, T>(
				() => new ConversionWorker(),
				input,
				{
					signal: abort.signal,
					timeoutMs: 120_000,
					transfer: input.bytes ? [input.bytes] : [],
				},
			);
		} catch (error) {
			if (!abort.signal.aborted)
				setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			if (controller.current === abort) {
				setBusy("");
				controller.current = undefined;
			}
		}
	}
	async function parse(selected: File, separator = delimiter) {
		setPreview(undefined);
		setFile(selected);
		if (selected.size > LIMITS.sourceBytes) {
			setMessage("Choose a file smaller than 64 MiB.");
			return;
		}
		const parsed = await task<ImportPreview>(
			{
				action: "import",
				bytes: await selected.arrayBuffer(),
				filename: selected.name,
				options: { delimiter: separator, types, header },
			},
			"Reading file…",
		);
		if (parsed) setPreview(parsed);
	}
	async function importWorkbook() {
		if (!preview || !canWriteContent) return;
		setBusy("Creating workbook…");
		setMessage("");
		try {
			const created = await actions.createResource({
				resourceTypeId: "lunaris.spreadsheet",
				name: preview.name,
				parentId: resource.parentId ?? workspaceId,
				initialPayload: {
					workbookUpdateV1: preview.serialized,
				} satisfies JsonObject,
			});
			if (!created) throw new Error("Workbook could not be created.");
			setPreview(undefined);
			setFile(undefined);
			navigation.navigateToWorkspaceResource(created.resourceId);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy("");
		}
	}
	async function exportWorkbook() {
		const current = active.current;
		if (!current) return;
		const calculationAbort = new AbortController();
		controller.current = calculationAbort;
		setBusy("Waiting for formulas…");
		try {
			await abortable(
				current.engine.univerAPI
					.getFormula()
					.onCalculationResultApplied(30_000),
				calculationAbort.signal,
			);
		} catch (error) {
			setBusy("");
			if (!calculationAbort.signal.aborted)
				setMessage(`Calculation did not finish: ${String(error)}`);
			return;
		} finally {
			if (controller.current === calculationAbort)
				controller.current = undefined;
		}
		const calculated: Record<string, Record<string, Scalar>> = {};
		const native = current.engine.univerAPI.getActiveWorkbook();
		for (const sheet of current.adapter.book.list()) {
			const view = native?.getSheetBySheetId(sheet.id)?.getSheet();
			for (const [key, input] of sheet.inputs)
				if (typeof input === "object") {
					const [rid, cid] = splitCellKey(key);
					const row = sheet.axis("rows").index.get(rid),
						column = sheet.axis("columns").index.get(cid);
					if (row === undefined || column === undefined) continue;
					const cell = view?.getCellRaw(row, column);
					const value =
						cell?.t === CellValueType.BOOLEAN ? Boolean(cell.v) : cell?.v;
					if (
						typeof value === "string" ||
						typeof value === "number" ||
						typeof value === "boolean"
					)
						(calculated[sheet.id] ??= {})[key] = value;
				}
		}
		const result = await task<ExportResult>(
			{
				action: "export",
				workbook: current.adapter.book.snapshot(),
				format,
				activeSheet: native?.getActiveSheet()?.getSheetId(),
				calculated,
			},
			"Preparing export…",
		);
		if (!result) return;
		setWarnings(result.warnings);
		const suggestedName = `${current.adapter.book.name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_").slice(0, 180) || "Spreadsheet"}.${result.extension}`;
		const abort = new AbortController();
		controller.current = abort;
		setBusy("Saving export…");
		try {
			if (downloads.saveChunks)
				await downloads.saveChunks({
					suggestedName,
					mimeType: result.mimeType,
					signal: abort.signal,
					chunks: (async function* () {
						const data = new Uint8Array(result.bytes);
						for (let n = 0; n < data.length; n += 1024 * 1024)
							yield data.subarray(n, n + 1024 * 1024);
					})(),
				});
			else
				await downloads.save({
					suggestedName,
					mimeType: result.mimeType,
					data: result.bytes,
				});
		} catch (error) {
			if (!abort.signal.aborted)
				setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			controller.current = undefined;
			setBusy("");
		}
	}
	const notices = (
		<>
			{needsRecovery && (
				<div className="spreadsheet-notice" role="status">
					Concurrent deletions removed every sheet, row, or column.{" "}
					{canWriteContent && (
						<button onClick={() => active.current?.adapter.addBlankGrid()}>
							Add a blank grid
						</button>
					)}
				</div>
			)}
			{busy && (
				<div className="spreadsheet-notice" role="status">
					{busy}
					{controller.current && (
						<button onClick={() => controller.current?.abort()}>Cancel</button>
					)}
				</div>
			)}
			{message && (
				<div className="spreadsheet-notice spreadsheet-error" role="alert">
					{message}
					<button onClick={() => setMessage("")}>Dismiss</button>
				</div>
			)}
			{!!warnings.length && (
				<details className="spreadsheet-notice">
					<summary>Export notes ({warnings.length})</summary>
					<ul>
						{warnings.map((w) => (
							<li key={w}>{w}</li>
						))}
					</ul>
				</details>
			)}
		</>
	);
	if (error)
		return (
			<div className="spreadsheet-state" role="alert">
				<h2>Workbook could not load</h2>
				<p>{error.message}</p>
			</div>
		);
	if (isLoading)
		return (
			<div className="spreadsheet-state" role="status">
				Loading spreadsheet…
			</div>
		);
	if (!yDoc)
		return (
			<div className="spreadsheet-state" role="alert">
				Workbook storage is unavailable. Reopen this resource to retry.
			</div>
		);
	return (
		<div className="spreadsheet-shell">
			{ready && <ViewReady reportReady={reportReady} />}
			<div className="spreadsheet-workbench">
				<div className="spreadsheet-toolbar">
					<button
						ref={fileButton}
						popoverTarget={fileMenuId}
						className="spreadsheet-file-button"
					>
						File{" "}
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>
					<span
						className="spreadsheet-save"
						role="status"
						data-calculating={calculating}
						data-error={canWriteContent && persistence === "error"}
					>
						{!canWriteContent
							? "Read-only"
							: persistence === "persisting"
								? "Saving locally…"
								: persistence === "error"
									? "Could not save"
									: ready
										? "Saved locally"
										: "Opening…"}
						{ready && calculating ? " · Calculating…" : ""}
					</span>
				</div>
				<div
					ref={fileMenu}
					id={fileMenuId}
					popover="auto"
					className="spreadsheet-file-menu"
					aria-label="Workbook files"
				>
					<button
						className="spreadsheet-import-button"
						disabled={!ready || !canWriteContent || !!busy}
						onClick={() => {
							fileMenu.current?.hidePopover();
							fileInput.current?.click();
						}}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
						</svg>
						Import file
					</button>
					<div className="spreadsheet-export-options">
						<label className="spreadsheet-export-label">
							Export as
							<select
								value={format}
								disabled={!!busy}
								onChange={(event) =>
									setFormat(event.target.value as ExportFormat)
								}
							>
								{formats.map(([id, label]) => (
									<option key={id} value={id}>
										{label}
									</option>
								))}
							</select>
						</label>
						<button
							className="spreadsheet-primary"
							disabled={!ready || !!busy || needsRecovery}
							onClick={() => {
								fileMenu.current?.hidePopover();
								void exportWorkbook();
							}}
						>
							Export
						</button>
					</div>
				</div>
				<input
					ref={fileInput}
					type="file"
					hidden
					accept=".csv,.tsv,.txt,.xlsx,.ods,.json"
					onChange={(event) => {
						const selected = event.target.files?.[0];
						if (selected) {
							const separator = selected.name.toLowerCase().endsWith(".tsv")
								? "\t"
								: ",";
							setDelimiter(separator);
							void parse(selected, separator);
						}
						event.target.value = "";
					}}
				/>
				{/* The preview covers the grid; keep hidden cells out of keyboard navigation. */}
				<div className="spreadsheet-editor" ref={container} inert={!!file} />
				{!file && <div className="spreadsheet-notices">{notices}</div>}
				{file && (
					<section
						ref={importPanel}
						tabIndex={-1}
						className="spreadsheet-import"
						aria-label="Import preview"
						onKeyDown={(event) => {
							if (event.key === "Escape" && !busy) {
								event.stopPropagation();
								closeImport();
							}
						}}
					>
						<div className="spreadsheet-import-heading">
							<div>
								<h2>Import workbook</h2>
								<p className="spreadsheet-filename">{file.name}</p>
							</div>
							<button disabled={!!busy} onClick={closeImport}>
								Close
							</button>
						</div>
						{notices}
						{/\.(csv|tsv|txt)$/iu.test(file.name) && (
							<div className="spreadsheet-import-options">
								<label>
									Delimiter{" "}
									<select
										disabled={!!busy}
										value={delimiter}
										onChange={(event) => {
											setDelimiter(event.target.value);
											setPreview(undefined);
										}}
									>
										<option value=",">Comma</option>
										<option value=";">Semicolon</option>
										<option value={"\t"}>Tab</option>
										<option value="|">Pipe</option>
									</select>
								</label>
								<label>
									Cell types{" "}
									<select
										disabled={!!busy}
										value={types}
										onChange={(event) => {
											setTypes(event.target.value as "text" | "infer");
											setPreview(undefined);
										}}
									>
										<option value="infer">Detect numbers and booleans</option>
										<option value="text">Keep everything as text</option>
									</select>
								</label>
								<label>
									<input
										type="checkbox"
										disabled={!!busy}
										checked={header}
										onChange={(event) => {
											setHeader(event.target.checked);
											setPreview(undefined);
										}}
									/>
									First row contains headers
								</label>
								<button disabled={!!busy} onClick={() => void parse(file)}>
									Refresh preview
								</button>
							</div>
						)}
						{preview && (
							<>
								<div className="spreadsheet-preview">
									<table>
										<caption>
											First rows · {preview.sheetCount} sheet(s)
										</caption>
										<tbody>
											{preview.preview.map((row, r) => (
												<tr key={r}>
													{row.map((value, c) => (
														<td key={c}>{String(value)}</td>
													))}
												</tr>
											))}
										</tbody>
									</table>
								</div>
								{!!preview.warnings.length && (
									<details>
										<summary>
											Conversion notes ({preview.warnings.length})
										</summary>
										<ul>
											{preview.warnings.map((w) => (
												<li key={w}>{w}</li>
											))}
										</ul>
									</details>
								)}
								<p>
									Creates a new workbook in this folder. The current workbook
									stays open until import completes.
								</p>
								<button
									className="spreadsheet-primary"
									disabled={!!busy || !canWriteContent}
									onClick={() => void importWorkbook()}
								>
									Create workbook
								</button>
							</>
						)}
					</section>
				)}
			</div>
		</div>
	);
}
