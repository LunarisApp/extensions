import { describe, expect, it } from "vitest";
import { yjsToExcalidraw } from "y-excalidraw";
import {
	applyUpdateV2,
	Doc,
	encodeStateAsUpdateV2,
	Map as YMap,
} from "yjs";
import { excalidrawLanguage } from "./locale";

function storedElement(id: string, position: string, x: number) {
	return new YMap<unknown>([
		[
			"el",
			{
				angle: 0,
				backgroundColor: "transparent",
				boundElements: null,
				fillStyle: "solid",
				groupIds: [],
				height: 100,
				id,
				isDeleted: false,
				opacity: 100,
				roughness: 1,
				seed: 1,
				strokeColor: "#1e1e1e",
				strokeStyle: "solid",
				strokeWidth: 2,
				type: "rectangle",
				updated: 1,
				version: 1,
				versionNonce: 1,
				width: 100,
				x,
				y: 20,
			},
		],
		["pos", position],
	]);
}

describe("existing Excalidraw Yjs format", () => {
	it("round-trips elements and assets without migration", () => {
		const source = new Doc();
		source.getArray<YMap<unknown>>("elements").push([
			storedElement("first", "a0", 10),
		]);
		source.getMap("assets").set("file-1", { dataURL: "data:image/png;base64,AA==" });

		const restored = new Doc();
		applyUpdateV2(restored, encodeStateAsUpdateV2(source));

		expect(yjsToExcalidraw(restored.getArray("elements"))).toEqual([
			expect.objectContaining({ id: "first", type: "rectangle", x: 10 }),
		]);
		expect(restored.getMap("assets").get("file-1")).toEqual({
			dataURL: "data:image/png;base64,AA==",
		});
		source.destroy();
		restored.destroy();
	});

	it("reflects collaborative element edits", () => {
		const doc = new Doc();
		const stored = storedElement("box", "a0", 10);
		doc.getArray<YMap<unknown>>("elements").push([stored]);
		stored.set("el", { ...(stored.get("el") as object), x: 80 });

		expect(yjsToExcalidraw(doc.getArray("elements"))[0]).toMatchObject({
			id: "box",
			x: 80,
		});
		doc.destroy();
	});
});

describe("Excalidraw locale mapping", () => {
	it("maps Excalidraw locale variants and preserves supported locales", () => {
		expect(excalidrawLanguage("es")).toBe("es-ES");
		expect(excalidrawLanguage("es-MX")).toBe("es-ES");
		expect(excalidrawLanguage("pt-BR")).toBe("pt-BR");
	});
});
