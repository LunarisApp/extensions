import { describe, expect, test } from "bun:test";

const styles = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

describe("Northstar Pulse theme contract", () => {
  test("uses the host theme variables with explicit fallbacks", () => {
    expect(styles).toContain("--pulse-bg: var(--background");
    expect(styles).toContain("--pulse-ink: var(--foreground");
    expect(styles).toContain("--pulse-primary: var(--primary");
    expect(styles).not.toContain("color-scheme:");
  });

  test("supports narrow panels and reduced motion", () => {
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain("@media (max-width: 430px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
