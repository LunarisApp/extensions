import { describe, expect, it } from "vitest";
import { excalidrawExtensionIcon } from "./icon";

describe("excalidrawExtensionIcon", () => {
	it("uses sandbox-serializable SVG data", () => {
		expect(excalidrawExtensionIcon).toEqual([
			["path", expect.objectContaining({ fill: "currentColor" })],
		]);
		expect(() => JSON.stringify(excalidrawExtensionIcon)).not.toThrow();
	});
});
