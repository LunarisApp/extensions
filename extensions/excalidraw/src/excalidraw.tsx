import { Excalidraw } from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { MaybePromise } from "@excalidraw/excalidraw/utility-types";
import type { Ref } from "react";
import type { ExcalidrawBinding } from "y-excalidraw";

import "@excalidraw/excalidraw/index.css";

interface ExcalidrawEditorProps {
  binding?: ExcalidrawBinding;
  initialData?: MaybePromise<ExcalidrawInitialDataState | null>;
  lang?: string;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
  readOnly?: boolean;
  ref?: Ref<HTMLDivElement>;
  theme?: "light" | "dark";
}

export function ExcalidrawEditor({
  initialData,
  binding,
  onApiReady,
  readOnly = false,
  theme,
  lang,
  ref,
}: ExcalidrawEditorProps) {
  return (
    <div className="excalidraw-editor" ref={ref}>
      <Excalidraw
        excalidrawAPI={onApiReady}
        initialData={initialData}
        langCode={lang}
        onPointerUpdate={binding?.onPointerUpdate}
        theme={theme}
        viewModeEnabled={readOnly}
      />
    </div>
  );
}
