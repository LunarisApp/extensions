import { z } from "zod";

export const PULSE_STORAGE_KEY = "snapshot";
export type PulseStatus = "at-risk" | "off-track" | "on-track";

function utcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function deriveStatus(completionPercent: number, blocked: number): PulseStatus {
  if (blocked >= 6) return "off-track";
  if (blocked >= 3 || completionPercent < 50) return "at-risk";
  return "on-track";
}

const utcDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const pulseSnapshotShape = z.object({
  generatedAt: z.string().datetime(),
  metrics: z.object({
    activeContributors: z.number().int().min(3).max(14),
    completedTasks: z.number().int().min(14).max(98),
    completionPercent: z.number().int().min(0).max(100),
    openBlockers: z.number().int().min(0).max(8),
  }).strict(),
  reportingPeriod: z.object({
    days: z.literal(7),
    end: utcDateSchema,
    start: utcDateSchema,
  }).strict(),
  status: z.enum(["on-track", "at-risk", "off-track"]),
  trend: z.array(z.object({
    completedTasks: z.number().int().min(2).max(14),
    date: utcDateSchema,
  }).strict()).length(7),
  work: z.object({
    blocked: z.number().int().min(0).max(8),
    completed: z.number().int().min(14).max(98),
    inProgress: z.number().int().min(3).max(18),
    notStarted: z.number().int().min(5).max(30),
  }).strict(),
}).strict();

export const pulseSnapshotSchema = pulseSnapshotShape.superRefine((snapshot, context) => {
  const completed = snapshot.trend.reduce((total, point) => total + point.completedTasks, 0);
  const totalWork = Object.values(snapshot.work).reduce((total, count) => total + count, 0);
  const completionPercent = Math.round((snapshot.work.completed / totalWork) * 100);
  const expectedStatus = deriveStatus(completionPercent, snapshot.work.blocked);

  if (snapshot.metrics.completedTasks !== completed) {
    context.addIssue({ code: "custom", message: "must equal the seven-day trend total", path: ["metrics", "completedTasks"] });
  }
  if (snapshot.work.completed !== completed) {
    context.addIssue({ code: "custom", message: "must equal the seven-day trend total", path: ["work", "completed"] });
  }
  if (snapshot.metrics.openBlockers !== snapshot.work.blocked) {
    context.addIssue({ code: "custom", message: "must equal blocked work", path: ["metrics", "openBlockers"] });
  }
  if (snapshot.metrics.completionPercent !== completionPercent) {
    context.addIssue({ code: "custom", message: "must derive from the work breakdown", path: ["metrics", "completionPercent"] });
  }
  if (snapshot.status !== expectedStatus) {
    context.addIssue({ code: "custom", message: "must derive from progress and blockers", path: ["status"] });
  }

  const dates = snapshot.trend.map((point, index) => {
    const date = new Date(`${point.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || utcDate(date) !== point.date) {
      context.addIssue({ code: "custom", message: "must be a valid UTC date", path: ["trend", index, "date"] });
      return undefined;
    }
    return date;
  });
  if (dates.some((date) => date === undefined)) return;

  for (let index = 1; index < dates.length; index += 1) {
    if ((dates[index]?.getTime() ?? 0) - (dates[index - 1]?.getTime() ?? 0) !== 86_400_000) {
      context.addIssue({ code: "custom", message: "dates must be consecutive and ascending", path: ["trend", index, "date"] });
    }
  }
  if (snapshot.reportingPeriod.start !== snapshot.trend[0]?.date) {
    context.addIssue({ code: "custom", message: "must equal the first trend date", path: ["reportingPeriod", "start"] });
  }
  if (snapshot.reportingPeriod.end !== snapshot.trend[6]?.date) {
    context.addIssue({ code: "custom", message: "must equal the last trend date", path: ["reportingPeriod", "end"] });
  }
  if (snapshot.reportingPeriod.end !== utcDate(new Date(snapshot.generatedAt))) {
    context.addIssue({ code: "custom", message: "must contain the generation date", path: ["reportingPeriod", "end"] });
  }
});

export type PulseSnapshot = z.infer<typeof pulseSnapshotSchema>;
export type RandomSource = () => number;

function randomInteger(random: RandomSource, minimum: number, maximum: number) {
  const value = Math.min(0.9999999999999999, Math.max(0, random()));
  return minimum + Math.floor(value * (maximum - minimum + 1));
}

export function generatePulseSnapshot(
  createdAt: string,
  random: RandomSource = Math.random,
): PulseSnapshot {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    throw new Error("Northstar Pulse requires a valid creation timestamp");
  }

  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(created);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return {
      completedTasks: randomInteger(random, 2, 14),
      date: utcDate(date),
    };
  });
  const completed = trend.reduce((total, point) => total + point.completedTasks, 0);
  const work = {
    blocked: randomInteger(random, 0, 8),
    completed,
    inProgress: randomInteger(random, 3, 18),
    notStarted: randomInteger(random, 5, 30),
  };
  const totalWork = Object.values(work).reduce((total, count) => total + count, 0);
  const completionPercent = Math.round((completed / totalWork) * 100);

  return pulseSnapshotSchema.parse({
    generatedAt: created.toISOString(),
    metrics: {
      activeContributors: randomInteger(random, 3, 14),
      completedTasks: completed,
      completionPercent,
      openBlockers: work.blocked,
    },
    reportingPeriod: {
      days: 7,
      end: trend[6]?.date,
      start: trend[0]?.date,
    },
    status: deriveStatus(completionPercent, work.blocked),
    trend,
    work,
  });
}
