import { describe, expect, test } from "bun:test";
import { generatePulseSnapshot, pulseSnapshotSchema } from "../src/domain";

function sequence(values: number[]) {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

describe("Northstar Pulse generation", () => {
  test("creates a coherent seven-day project snapshot", () => {
    const pulse = generatePulseSnapshot(
      "2026-09-03T09:30:00.000Z",
      sequence([0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.9, 0.2, 0.4, 0.6, 0.8]),
    );

    expect(pulseSnapshotSchema.safeParse(pulse).success).toBeTrue();
    expect(pulse.generatedAt).toBe("2026-09-03T09:30:00.000Z");
    expect(pulse.reportingPeriod).toEqual({ days: 7, start: "2026-08-28", end: "2026-09-03" });
    expect(pulse.trend).toHaveLength(7);
    expect(pulse.trend.map((point) => point.date)).toEqual([
      "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
      "2026-09-01", "2026-09-02", "2026-09-03",
    ]);

    const completed = pulse.trend.reduce((sum, point) => sum + point.completedTasks, 0);
    const total = Object.values(pulse.work).reduce((sum, value) => sum + value, 0);
    expect(pulse.metrics.completedTasks).toBe(completed);
    expect(pulse.work.completed).toBe(completed);
    expect(pulse.metrics.openBlockers).toBe(pulse.work.blocked);
    expect(pulse.metrics.completionPercent).toBe(Math.round((completed / total) * 100));
  });

  test("keeps all randomized values within their documented ranges", () => {
    for (const randomValue of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const pulse = generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => randomValue);
      expect(pulseSnapshotSchema.safeParse(pulse).success).toBeTrue();
    }
  });

  test("derives each project status from progress and blockers", () => {
    expect(generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => 0).status).toBe("on-track");
    expect(generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => 0.5).status).toBe("at-risk");
    expect(generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => 0.999999).status).toBe("off-track");
  });

  test("produces different snapshots from different random sequences", () => {
    const first = generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => 0.1);
    const second = generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => 0.8);
    expect(second).not.toEqual(first);
  });

  test("rejects snapshots with contradictory derived values", () => {
    const pulse = generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => 0.5);
    expect(pulseSnapshotSchema.safeParse({
      ...pulse,
      metrics: { ...pulse.metrics, completedTasks: pulse.metrics.completedTasks + 1 },
    }).success).toBeFalse();
    expect(pulseSnapshotSchema.safeParse({
      ...pulse,
      status: "on-track",
    }).success).toBeFalse();
  });

  test("rejects invalid or unordered reporting dates", () => {
    const pulse = generatePulseSnapshot("2026-09-03T00:00:00.000Z", () => 0.5);
    const invalidDate = pulse.trend.map((point, index) =>
      index === 2 ? { ...point, date: "2026-02-31" } : point,
    );
    const duplicateDate = pulse.trend.map((point, index) =>
      index === 2 ? { ...point, date: pulse.trend[1]?.date } : point,
    );
    expect(pulseSnapshotSchema.safeParse({ ...pulse, trend: invalidDate }).success).toBeFalse();
    expect(pulseSnapshotSchema.safeParse({ ...pulse, trend: duplicateDate }).success).toBeFalse();
  });

  test("rejects an invalid creation timestamp", () => {
    expect(() => generatePulseSnapshot("not-a-date", () => 0.5)).toThrow(
      "Northstar Pulse requires a valid creation timestamp",
    );
  });
});
