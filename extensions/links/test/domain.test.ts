import { describe, expect, test } from "bun:test";
import {
  buildLinkCompileContent,
  createLinkRecord,
  DEFAULT_LINK_RECORD,
  labelFromUrl,
  normalizeLinkUrl,
  parseLinkRecord,
} from "../src/domain";
import { parseBrowserDestination } from "../src/browser-panel";

describe("link URL normalization", () => {
  test("adds HTTPS to ordinary host names", () => {
    expect(normalizeLinkUrl("docs.example.com/guide")).toEqual({
      error: null,
      url: "https://docs.example.com/guide",
    });
  });

  test("preserves valid HTTP and HTTPS addresses", () => {
    expect(normalizeLinkUrl("http://localhost:3000/path").url).toBe(
      "http://localhost:3000/path",
    );
    expect(normalizeLinkUrl("https://example.com/?q=links#top").url).toBe(
      "https://example.com/?q=links#top",
    );
  });

  test("rejects empty, non-web, and credential-bearing addresses", () => {
    expect(normalizeLinkUrl("").error).toBe("Enter a web address.");
    expect(normalizeLinkUrl("javascript:alert(1)").url).toBeNull();
    expect(normalizeLinkUrl("https://user:secret@example.com").error).toContain(
      "username or password",
    );
  });
});

describe("link records", () => {
  test("derives a readable label when none is supplied", () => {
    expect(labelFromUrl("https://www.example.com/path")).toBe("example.com");
    expect(createLinkRecord("", "example.com")).toEqual({
      label: "example.com",
      url: "https://example.com/",
      version: 1,
    });
  });

  test("normalizes legacy or malformed stored values safely", () => {
    expect(
      parseLinkRecord({ label: " Docs ", url: "docs.example.com", version: 9 }),
    ).toEqual({
      label: "Docs",
      url: "https://docs.example.com/",
      version: 1,
    });
    expect(parseLinkRecord({ label: 12, url: "file:///tmp/a" })).toEqual(
      DEFAULT_LINK_RECORD,
    );
  });

  test("compiles saved and empty links to portable content", () => {
    const saved = buildLinkCompileContent(
      createLinkRecord("Reference", "example.com/reference"),
    );
    expect(saved.title).toBe("Reference");
    expect(saved.sections).toContainEqual({
      text: "https://example.com/reference",
      type: "paragraph",
    });
    expect(buildLinkCompileContent(DEFAULT_LINK_RECORD).sections[0]).toEqual({
      text: "No web address has been attached yet.",
      type: "paragraph",
    });
  });
});

describe("browser panel params", () => {
  test("accepts only normalized destinations", () => {
    expect(
      parseBrowserDestination({ title: "Docs", url: "docs.example.com" }),
    ).toEqual({
      error: null,
      title: "Docs",
      url: "https://docs.example.com/",
    });
    expect(parseBrowserDestination({ url: "" })).toMatchObject({
      title: "Link",
      url: null,
    });
  });
});
