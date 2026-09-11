import { defaultTheme } from "@univerjs/presets";

// Univer draws the grid on canvas, so CSS variables alone cannot theme it.
// Keep its data/reference colors and replace only the application chrome.
const stone = {
	50: "#fafaf9",
	100: "#f5f5f4",
	200: "#e7e5e4",
	300: "#d6d3d1",
	400: "#a8a29e",
	500: "#78716c",
	600: "#57534e",
	700: "#44403c",
	800: "#292524",
	900: "#1c1917",
};
// CanvasColorService already inverts these colors in dark mode. Reversing
// the palette again would make the active-cell outline disappear on dark sheets.
export const workbookTheme = {
	...defaultTheme,
	gray: stone,
	primary: { ...stone, 500: stone[600], 600: stone[800] },
};
