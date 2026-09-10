import { exposePluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";
import { encodeWorkbookTransfer } from "./transfer";
import {
	importFile,
	exportFile,
	type ConversionTask,
	type ImportPreview,
} from "./formats";
exposePluginWorkerTask((task: ConversionTask) => {
	if (task.action === "import") {
		const result = importFile(task.bytes!, task.filename!, task.options);
		task.bytes = undefined;
		return {
			serialized: encodeWorkbookTransfer(result.workbook, true),
			name: result.workbook.name,
			sheetCount: result.workbook.sheets.length,
			warnings: result.warnings,
			preview: result.preview,
		} satisfies ImportPreview;
	}
	return exportFile(
		task.workbook!,
		task.format!,
		task.activeSheet,
		task.calculated,
	);
});
