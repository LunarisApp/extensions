import {
  defineExternalPlugin,
  defineExternalView,
} from "@lunarisapp/plugin-sdk";
import { Note01Icon } from "@lunarisapp/ui/icons";
import manifest from "../manifest.json";

export default defineExternalPlugin({
  manifest,
  modifications: [
    defineExternalView({
      icon: Note01Icon,
      id: "example.notes",
      name: "Example Notes",
      renderer: () => <div className="p-4">Hello from an external extension.</div>,
    }),
  ],
});
