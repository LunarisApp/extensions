import { definePlugin } from "@lunarisapp/plugin-sdk";
import { Note01Icon } from "@lunarisapp/ui/icons";
import manifest from "../manifest.json";

export default definePlugin({
  manifest,
  activate({ contributions }) {
    contributions.view({
      icon: Note01Icon,
      name: "Example Notes",
      renderer: () => <div className="p-4">Hello from an external extension.</div>,
      target: { kind: "standalone", launcher: { defaultPlacement: "primary" } },
      viewId: "example.notes",
    });
  },
});
