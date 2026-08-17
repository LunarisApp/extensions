import { describe, expect, test } from "bun:test";

const styles = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

describe("Lunaris theme contract", () => {
  test("uses only CSS variables forwarded into the extension sandbox", () => {
    expect(styles).toContain("--demo-bg: var(--background");
    expect(styles).toContain("--demo-primary: var(--primary");
    expect(styles).toContain("--demo-primary-ink: var(--primary-foreground");
    expect(styles).not.toMatch(/var\(--(?:card|input|ring|destructive)[,)]/);
  });

  test("inherits the host color scheme for native controls", () => {
    expect(styles).not.toContain("color-scheme:");
  });

  test("keeps the standalone status bar independent from component-scoped tokens", () => {
    const statusBarStyles = styles.match(/\.dossier-statusbar\s*\{([^}]*)\}/)?.[1];
    expect(statusBarStyles).toBeDefined();
    expect(statusBarStyles).not.toContain("var(--demo-");
  });
});
