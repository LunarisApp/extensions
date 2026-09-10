/** Stop waiting promptly even if the underlying calculation cannot be aborted. */
export async function abortable<T>(
	operation: Promise<T>,
	signal: AbortSignal,
): Promise<T> {
	if (signal.aborted) {
		void operation.catch(() => undefined);
		signal.throwIfAborted();
	}
	let cancelled!: () => void;
	const aborted = new Promise<never>((_, reject) => {
		cancelled = () => reject(signal.reason);
		signal.addEventListener("abort", cancelled, { once: true });
	});
	try {
		return await Promise.race([operation, aborted]);
	} finally {
		signal.removeEventListener("abort", cancelled);
	}
}
