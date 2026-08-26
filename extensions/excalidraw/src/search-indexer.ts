import type { SearchIndexerContribution } from "@lunarisapp/plugin-sdk";
import { EXCALIDRAW_EXTENSION_ID } from "./constants";

const MAX_INDEXED_TEXT_LENGTH = 100_000;
const NON_VISIBLE_MARKUP_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const MARKUP_PATTERN = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi;
const DATA_URL_PATTERN = /^data:[^,]*;base64,/i;
const NAMED_ELEMENT_TYPES = new Set(["frame", "magicframe"]);

type SceneElement = Record<string, unknown>;

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string" || DATA_URL_PATTERN.test(value.trim())) {
		return null;
	}

	const normalized = value
		.replace(/\r\n?/g, "\n")
		.replace(NON_VISIBLE_MARKUP_PATTERN, " ")
		.replace(MARKUP_PATTERN, " ")
		.replace(/[\t\f\v ]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return normalized || null;
}

function visibleLabel(element: SceneElement): string | null {
	if (
		element.isDeleted === true ||
		element.isGenerated === true ||
		element.generated === true ||
		element.hidden === true ||
		element.visible === false
	) {
		return null;
	}

	if (element.type === "text") {
		return normalizeText(element.originalText) ?? normalizeText(element.text);
	}
	if (typeof element.type === "string" && NAMED_ELEMENT_TYPES.has(element.type)) {
		return normalizeText(element.name);
	}
	return null;
}

function position(element: SceneElement, key: "x" | "y"): number {
	return typeof element[key] === "number" && Number.isFinite(element[key])
		? element[key]
		: Number.POSITIVE_INFINITY;
}

export function extractExcalidrawSearchText(payload: unknown): string | null {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return null;
	}
	const { assets, elements } = payload as {
		assets?: unknown;
		elements?: unknown;
	};
	if (
		!assets ||
		typeof assets !== "object" ||
		Array.isArray(assets) ||
		!Array.isArray(elements)
	) {
		return null;
	}

	const orderedElements = elements
		.map((element, order) => ({ element, order }))
		.filter(
			(entry): entry is { element: SceneElement; order: number } =>
				!!entry.element &&
				typeof entry.element === "object" &&
				!Array.isArray(entry.element),
		)
		.sort((left, right) => {
			const leftY = position(left.element, "y");
			const rightY = position(right.element, "y");
			if (leftY !== rightY) return leftY - rightY;
			const leftX = position(left.element, "x");
			const rightX = position(right.element, "x");
			if (leftX !== rightX) return leftX - rightX;
			return left.order - right.order;
		});

	const labels: string[] = [];
	const seen = new Set<string>();
	let length = 0;
	for (const { element } of orderedElements) {
		const label = visibleLabel(element);
		if (!label || seen.has(label)) continue;
		const separatorLength = labels.length > 0 ? 1 : 0;
		const remaining = MAX_INDEXED_TEXT_LENGTH - length - separatorLength;
		if (remaining <= 0) break;
		const boundedLabel = label.slice(0, remaining).trimEnd();
		if (!boundedLabel) break;
		labels.push(boundedLabel);
		seen.add(label);
		length += separatorLength + boundedLabel.length;
	}

	return labels.length > 0 ? labels.join("\n") : null;
}

export const excalidrawSearchIndexer: SearchIndexerContribution = {
	id: `${EXCALIDRAW_EXTENSION_ID}.search-indexer`,
	resourceTypeIds: [EXCALIDRAW_EXTENSION_ID],
	extractText: ({ payload }) => extractExcalidrawSearchText(payload),
};
