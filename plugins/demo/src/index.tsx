import {
  defineExternalPlugin,
  defineExternalView,
} from "@lunarisapp/plugin-sdk";
import { Note01Icon } from "@lunarisapp/ui/icons";
import manifest from "../plugin.json";

export default defineExternalPlugin({
  manifest,
  modifications: [
    defineExternalView({
      icon: Note01Icon,
      id: "lunaris.demo",
      name: "Demo",
      renderer: () => <div className="p-4">Hello from the Lunaris plugin registry.</div>,
    }),
  ],
});
