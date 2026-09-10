import { expect, it } from "vitest";
import { abortable } from "./cancellation";
it("cancels while waiting for formula results", async () => {
	const controller = new AbortController();
	const pending = abortable(new Promise<void>(() => {}), controller.signal);
	const rejected = expect(pending).rejects.toThrow();
	controller.abort();
	await rejected;
});
