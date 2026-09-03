import { z } from "zod";

export const PULSE_STORAGE_KEY = "snapshot";

const utcDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pulseSnapshotSchema = z.object({
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

export type PulseSnapshot = z.infer<typeof pulseSnapshotSchema>;
export type PulseStatus = PulseSnapshot["status"];
export type RandomSource = () => number;

function randomInteger(random: RandomSource, minimum: number, maximum: number) {
  const value = Math.min(0.9999999999999999, Math.max(0, random()));
  return minimum + Math.floor(value * (maximum - minimum + 1));
}

function utcDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function deriveStatus(completionPercent: number, blocked: number): PulseStatus {
  if (blocked >= 6) return "off-track";
  if (blocked >= 3 || completionPercent < 50) return "at-risk";
  return "on-track";
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
