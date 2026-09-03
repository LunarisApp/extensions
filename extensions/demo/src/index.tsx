import {
  type IconSvgObject,
  type JsonValue,
  type ResourceInitializeContext,
  type ResourcePayloadContext,
  definePlugin,
} from "@lunarisapp/plugin-sdk";
import manifest from "../manifest.json";
import { NorthstarPulseRenderer } from "./dashboard";
import { PULSE_STORAGE_KEY, generatePulseSnapshot, pulseSnapshotSchema } from "./domain";
import "./styles.css";

export const NORTHSTAR_PULSE_ID = "lunaris.demo.northstar-pulse";
export const NORTHSTAR_PULSE_SCHEMA_ID = "lunaris.demo.northstar-pulse.data";
export const NORTHSTAR_PULSE_VIEW_ID = NORTHSTAR_PULSE_ID;

export const pulseIcon: IconSvgObject = [
  ["path", { d: "M4 19V9m5 10V5m5 14v-7m5 7V3" }],
  ["path", { d: "M3 21h18" }],
];

export const northstarPulseResourceType = {
  defaultViewId: NORTHSTAR_PULSE_VIEW_ID,
  hierarchy: { userCreatable: true, visible: true },
  icon: pulseIcon,
  name: "Northstar Pulse",
  resourceTypeId: NORTHSTAR_PULSE_ID,
  schema: {
    currentVersion: 1,
    id: NORTHSTAR_PULSE_SCHEMA_ID,
    read: ({ storage }: ResourcePayloadContext) => {
      const pulse = storage.pulse;
      if (pulse?.kind !== "key-value") throw new Error("Northstar Pulse key-value storage is unavailable");
      return pulse.values[PULSE_STORAGE_KEY];
    },
    versions: { 1: pulseSnapshotSchema },
  },
  storage: {
    pulse: {
      initialize: ({ createdAt }: ResourceInitializeContext) => ({
        [PULSE_STORAGE_KEY]: generatePulseSnapshot(createdAt) as unknown as JsonValue,
      }),
      kind: "key-value" as const,
    },
  },
};

export const northstarPulseView = {
  icon: pulseIcon,
  name: "Northstar Pulse",
  renderer: NorthstarPulseRenderer,
  storageRequirements: { pulse: "key-value" as const },
  target: {
    kind: "resource" as const,
    resourceTypeIds: [NORTHSTAR_PULSE_ID],
    schemas: [{ id: NORTHSTAR_PULSE_SCHEMA_ID, maximumVersion: 1, minimumVersion: 1 }],
  },
  viewId: NORTHSTAR_PULSE_VIEW_ID,
};

export default definePlugin({
  manifest,
  activate({ contributions }) {
    contributions.resourceType(northstarPulseResourceType);
    contributions.view(northstarPulseView);
  },
});
