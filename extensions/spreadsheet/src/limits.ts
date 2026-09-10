export const LIMITS = Object.freeze({
	rows: 100_000,
	columns: 16_384,
	cells: 2_000_000,
	sourceBytes: 64 * 1024 * 1024,
	textBytes: 128 * 1024 * 1024,
	exportBytes: 256 * 1024 * 1024,
});
export function boundedInteger(
	value: number,
	maximum: number,
	label: string,
): void {
	if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
		throw new Error(
			`${label} must be between 0 and ${maximum.toLocaleString()}.`,
		);
	}
}
