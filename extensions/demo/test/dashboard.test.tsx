import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NorthstarPulseRenderer, PulseDashboard, PulseViewContent } from "../src/dashboard";
import { generatePulseSnapshot } from "../src/domain";

const snapshot = generatePulseSnapshot("2026-09-03T09:30:00.000Z", () => 0.5);

describe("Northstar Pulse dashboard", () => {
  test("renders the stored metrics, chart, status, and work breakdown", () => {
    const markup = renderToStaticMarkup(<PulseDashboard snapshot={snapshot} />);
    expect(markup).toContain("Northstar Pulse");
    expect(markup).toContain("Generated sample");
    expect(markup).toContain("Overall progress");
    expect(markup).toContain("Active contributors");
    expect(markup).toContain("Completed tasks over seven days");
    expect(markup).toContain("Weekly high");
    expect(markup).toContain("blockers need a closer look");
    expect(markup).toContain("Work breakdown");
    expect(markup).toContain("At risk");
  });

  test("renders loading, missing, and invalid data states", () => {
    expect(renderToStaticMarkup(<PulseViewContent isLoading value={null} />)).toContain("Loading Northstar Pulse");
    expect(renderToStaticMarkup(<PulseViewContent isLoading={false} value={null} />)).toContain("Pulse data is missing");
    expect(renderToStaticMarkup(<PulseViewContent isLoading={false} value={{ status: "unknown" }} />)).toContain("Pulse data is invalid");
  });

  test("renders a terminal state for an incorrect storage slot", () => {
    const element = NorthstarPulseRenderer({
      resource: {
        parentId: null,
        resourceId: "pulse-1",
        resourceTypeId: "lunaris.demo.northstar-pulse",
        schemaId: "lunaris.demo.northstar-pulse.data",
        schemaVersion: 1,
      },
      storage: { pulse: { kind: "file", storageId: "wrong-storage" } },
    });
    expect(renderToStaticMarkup(element)).toContain("Pulse storage is unavailable");
  });
});
