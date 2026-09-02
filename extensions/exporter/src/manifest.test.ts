import { getViewContributions, preparePluginActivation } from "@lunarisapp/plugin-sdk";
import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";
import plugin from "./index";

describe("exporter manifest", () => {
  it("declares the permission needed to persist export selections", () => {
    expect(manifest.permissions).toContain("content.write");
  });

  it("keeps the default renderer sandbox for canvas PDF previews", async () => {
    const activation = await preparePluginActivation(plugin);
    try {
      const view = getViewContributions(activation).find(
        ({ viewId }) => viewId === manifest.id,
      );
      expect(view?.rendererSandbox).toBeUndefined();
    } finally {
      await activation.dispose();
    }
  });
});
