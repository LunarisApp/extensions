const EXCALIDRAW_LANG: Record<string, string> = {
	en: "en",
	es: "es-ES",
};

export function excalidrawLanguage(locale: string): string {
	return EXCALIDRAW_LANG[locale] ?? EXCALIDRAW_LANG[locale.split("-")[0] ?? ""] ?? locale;
}
