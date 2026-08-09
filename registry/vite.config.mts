import { defineLunarisPluginConfig } from "@lunarisapp/plugin-sdk/vite";

const root = process.env.PLUGIN_ROOT;
const expectedId = process.env.PLUGIN_EXPECTED_ID;
const tag = process.env.PLUGIN_RELEASE_TAG;

if (!root || !expectedId || !tag) {
  throw new Error(
    "PLUGIN_ROOT, PLUGIN_EXPECTED_ID, and PLUGIN_RELEASE_TAG are required",
  );
}

export default defineLunarisPluginConfig({ expectedId, root, tag });
