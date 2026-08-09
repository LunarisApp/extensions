import { definePlugin, defineWorkspacePanel } from "@lunarisapp/plugin-sdk";
import { Note01Icon } from "@lunarisapp/ui/icons";
import manifest from "../plugin.json";

export default definePlugin({
  manifest,
  modifications: [
    defineWorkspacePanel({
      icon: Note01Icon,
      id: "example.notes",
      name: "Example Notes",
      renderer: () => <div className="p-4">Hello from an external plugin.</div>,
    }),
  ],
});
