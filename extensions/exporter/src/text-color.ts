import { DEFAULT_PDF_THEME } from "./theme";

function relativeLuminance(value: string): number | null {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function readableTextColor(value: string | undefined, fallback: string): string {
  for (const candidate of [value, fallback, DEFAULT_PDF_THEME.colors.text]) {
    if (!candidate) continue;
    const luminance = relativeLuminance(candidate);
    if (luminance !== null && 1.05 / (luminance + 0.05) >= 4.5) return candidate;
  }
  return DEFAULT_PDF_THEME.colors.text;
}
