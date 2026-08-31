import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

describe("exporter manifest", () => {
  it("declares the permission needed to persist export selections", () => {
    expect(manifest.permissions).toContain("content.write");
  });
});
