import {
	cellKey,
	splitCellKey,
	type Formula,
	type Input,
	type Workbook,
} from "./model";

/** Local dependency index. Univer's default iterative cycle behavior returns zero;
 * the supported workbook contract instead displays an explicit cycle error. */
export class FormulaGraph {
	private nodes = new Map<string, Formula>();
	private cached?: Set<string>;
	constructor(private book: Workbook) {}
	rebuild() {
		this.nodes.clear();
		this.cached = undefined;
		for (const sheet of this.book.list())
			for (const [key, input] of sheet.inputs) {
				if (typeof input !== "object") continue;
				const [r, c] = splitCellKey(key);
				if (
					sheet.axis("rows").index.has(r) &&
					sheet.axis("columns").index.has(c)
				)
					this.update(sheet.id, key, input);
			}
	}
	update(sheet: string, key: string, input?: Input) {
		const id = `${sheet}/${key}`;
		if (typeof input === "object") {
			this.nodes.set(id, input);
			this.cached = undefined;
		} else if (this.nodes.delete(id)) this.cached = undefined;
	}
	cycles(): Set<string> {
		if (this.cached) return this.cached;
		const result = new Set<string>();
		const discovery = new Map<string, number>();
		const low = new Map<string, number>();
		const componentStack: string[] = [];
		const onStack = new Set<string>();
		let sequence = 0;
		const columnsBySheet = new Map<
			string,
			Map<number, Array<{ row: number; id: string }>>
		>();
		for (const id of this.nodes.keys()) {
			const [sheetId, rowId, columnId] = id.split("/");
			const sheet = this.book.sheet(sheetId!);
			const row = sheet?.axis("rows").physical.get(rowId!);
			const column = sheet?.axis("columns").physical.get(columnId!);
			if (row === undefined || column === undefined) continue;
			const columns =
				columnsBySheet.get(sheetId!) ??
				new Map<number, Array<{ row: number; id: string }>>();
			columnsBySheet.set(sheetId!, columns);
			const nodes = columns.get(column) ?? [];
			columns.set(column, nodes);
			nodes.push({ row, id });
		}
		for (const columns of columnsBySheet.values())
			for (const nodes of columns.values()) nodes.sort((a, b) => a.row - b.row);
		const neighbors = (id: string): string[] => {
			const edges = new Set<string>();
			for (const token of this.nodes.get(id)?.tokens ?? []) {
				if (typeof token === "string") continue;
				const ref = token.reference,
					sheet = this.book.sheet(ref.sheet);
				if (!sheet) continue;
				if (!token.end) {
					const target = `${ref.sheet}/${cellKey(ref.row, ref.column)}`;
					if (this.nodes.has(target)) edges.add(target);
				} else {
					const rows = sheet.axis("rows"),
						columns = sheet.axis("columns");
					const r1 = rows.physical.get(ref.row),
						r2 = rows.physical.get(token.end.row);
					const c1 = columns.physical.get(ref.column),
						c2 = columns.physical.get(token.end.column);
					if (
						r1 === undefined ||
						r2 === undefined ||
						c1 === undefined ||
						c2 === undefined
					)
						continue;
					for (const [column, nodes] of columnsBySheet.get(sheet.id) ?? []) {
						if (column < Math.min(c1, c2) || column > Math.max(c1, c2))
							continue;
						let left = 0,
							right = nodes.length;
						while (left < right) {
							const middle = (left + right) >>> 1;
							if (nodes[middle]!.row < Math.min(r1, r2)) left = middle + 1;
							else right = middle;
						}
						for (
							let index = left;
							index < nodes.length && nodes[index]!.row <= Math.max(r1, r2);
							index++
						)
							edges.add(nodes[index]!.id);
					}
				}
			}
			return [...edges];
		};
		// Iterative Tarjan traversal: a completed DFS branch may still belong to
		// an open component, so back-edge stack marking alone misses some cycles.
		const enter = (id: string) => {
			discovery.set(id, sequence);
			low.set(id, sequence++);
			componentStack.push(id);
			onStack.add(id);
			return { id, edges: neighbors(id), next: 0 };
		};
		for (const root of this.nodes.keys()) {
			if (discovery.has(root)) continue;
			const stack = [enter(root)];
			while (stack.length) {
				const frame = stack[stack.length - 1]!;
				const target = frame.edges[frame.next++];
				if (target !== undefined) {
					if (!discovery.has(target)) stack.push(enter(target));
					else if (onStack.has(target))
						low.set(
							frame.id,
							Math.min(low.get(frame.id)!, discovery.get(target)!),
						);
					continue;
				}
				stack.pop();
				if (stack.length) {
					const parent = stack[stack.length - 1]!.id;
					low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
				}
				if (low.get(frame.id) === discovery.get(frame.id)) {
					const members: string[] = [];
					let member: string;
					do {
						member = componentStack.pop()!;
						onStack.delete(member);
						members.push(member);
					} while (member !== frame.id);
					if (members.length > 1 || frame.edges.includes(frame.id))
						for (const id of members) result.add(id);
				}
			}
		}
		return (this.cached = result);
	}
}
