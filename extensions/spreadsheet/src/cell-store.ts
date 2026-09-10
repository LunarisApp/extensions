import * as Y from "yjs";
import type { Input } from "./model";

const CHUNK_ROWS = 256;
const CACHE_CHUNKS = 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/** Immutable import chunks plus sparse CRDT overrides. A cleared base cell is a
 * null override, so concurrent edits never require replacing a shared chunk. */
export const inputBytes = (value: Input | undefined | null): number =>
	value == null
		? 0
		: encoder.encode(
				typeof value === "object" ? JSON.stringify(value) : String(value),
			).length;
export class CellStore implements Iterable<[string, Input]> {
	private stats?: { cells: number; text: number };
	private cache = new Map<string, Record<string, Input>>();
	constructor(
		readonly edits: Y.Map<Input | null>,
		readonly base: Y.Map<Uint8Array>,
		readonly counts: Y.Map<number>,
		readonly textCounts: Y.Map<number>,
		private rowPosition: (id: string) => number | undefined,
	) {
		edits.observe(this.edited);
		counts.observe(this.invalidateStats);
		textCounts.observe(this.invalidateStats);
	}
	private invalidateStats = () => {
		this.stats = undefined;
	};
	private edited = (event: Y.YMapEvent<Input | null>) => {
		if (!this.stats) return;
		for (const [key, change] of event.changes.keys) {
			const base = this.baseValue(key);
			const before =
				change.action === "add" ? base : (change.oldValue as Input | null);
			const after = change.action === "delete" ? base : this.edits.get(key);
			this.stats.cells += Number(after != null) - Number(before != null);
			this.stats.text += inputBytes(after) - inputBytes(before);
		}
	};
	destroy() {
		this.edits.unobserve(this.edited);
		this.counts.unobserve(this.invalidateStats);
		this.textCounts.unobserve(this.invalidateStats);
	}
	private metrics() {
		if (this.stats) return this.stats;
		let cells = 0,
			text = 0;
		for (const n of this.counts.values()) cells += n;
		for (const n of this.textCounts.values()) text += n;
		for (const [key, value] of this.edits) {
			const base = this.baseValue(key);
			cells += Number(value != null) - Number(base != null);
			text += inputBytes(value) - inputBytes(base);
		}
		return (this.stats = { cells, text });
	}
	get textBytes(): number {
		return this.metrics().text;
	}
	private chunk(key: string): string | undefined {
		const row = this.rowPosition(key.slice(0, key.indexOf("/")));
		return row === undefined ? undefined : String(Math.floor(row / CHUNK_ROWS));
	}
	private block(id: string): Record<string, Input> {
		const cached = this.cache.get(id);
		if (cached) {
			this.cache.delete(id);
			this.cache.set(id, cached);
			return cached;
		}
		const bytes = this.base.get(id);
		const value = bytes
			? (JSON.parse(decoder.decode(bytes)) as Record<string, Input>)
			: {};
		this.cache.set(id, value);
		if (this.cache.size > CACHE_CHUNKS)
			this.cache.delete(this.cache.keys().next().value!);
		return value;
	}
	private baseValue(key: string): Input | undefined {
		const id = this.chunk(key);
		return id === undefined ? undefined : this.block(id)[key];
	}
	get(key: string): Input | undefined {
		return this.edits.has(key)
			? (this.edits.get(key) ?? undefined)
			: this.baseValue(key);
	}
	has(key: string): boolean {
		return this.get(key) !== undefined;
	}
	set(key: string, value: Input): void {
		this.edits.set(key, value);
	}
	delete(key: string): void {
		if (this.baseValue(key) !== undefined) this.edits.set(key, null);
		else this.edits.delete(key);
	}
	get size(): number {
		return this.metrics().cells;
	}
	*[Symbol.iterator](): Generator<[string, Input]> {
		for (const id of this.base.keys())
			for (const [key, value] of Object.entries(this.block(id)))
				if (!this.edits.has(key)) yield [key, value];
		for (const [key, value] of this.edits)
			if (value !== null) yield [key, value];
	}
	*keys(): Generator<string> {
		for (const [key] of this) yield key;
	}
	/** Only used while initializing a new resource, never to compact live edits. */
	loadBase(inputs: Record<string, Input>): void {
		// Group only keys. Retaining a second dictionary of all decoded cell
		// values or Object.entries for millions of cells inflates import peaks.
		const groups = new Map<string, string[]>();
		for (const key of Object.keys(inputs)) {
			const id = this.chunk(key);
			if (id === undefined) throw new Error("Imported cell has no row.");
			(groups.get(id) ?? (groups.set(id, []), groups.get(id)!)).push(key);
		}
		this.importOrdered(
			(function* (): Generator<[string, Input]> {
				for (const keys of groups.values())
					for (const key of keys) yield [key, inputs[key]!];
			})(),
		);
	}
	/** Stream ordered rows without retaining the full decoded import in memory. */
	importOrdered(entries: Iterable<[string, Input]>): void {
		let previous: string | undefined;
		let values: Record<string, Input> = {};
		const flush = () => {
			if (previous !== undefined) {
				this.base.set(previous, encoder.encode(JSON.stringify(values)));
				this.counts.set(previous, Object.keys(values).length);
				this.textCounts.set(
					previous,
					Object.values(values).reduce<number>(
						(sum, value) => sum + inputBytes(value),
						0,
					),
				);
				values = {};
			}
		};
		for (const [key, value] of entries) {
			const id = this.chunk(key);
			if (id === undefined) throw new Error("Imported cell has no row.");
			if (previous !== id) {
				flush();
				previous = id;
				if (this.base.has(id)) throw new Error("Import rows must be ordered.");
			}
			values[key] = value;
		}
		flush();
		this.cache.clear();
	}
	invalidate(): void {
		this.cache.clear();
	}
}
