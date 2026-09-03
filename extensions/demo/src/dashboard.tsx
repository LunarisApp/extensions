/*
THESIS: Northstar Pulse is a project instrument panel, not a stack of dashboard cards.
OWN-WORLD: Host-native paper, graphite rules, tabular figures, and semantic signal color.
STORY: Confirm status, scan the four measures, trace the week, then inspect remaining work.
FIRST VIEWPORT: Status header, continuous KPI register, dominant line chart, compact work register.
FORM: Pulse Register; assigned surface structure; seed 8d1308b2.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
*/
import {
  ViewReady,
  type ResourceStorageHandle,
  type ResourceViewProps,
  useKeyValue,
} from "@lunarisapp/plugin-sdk";
import { PULSE_STORAGE_KEY, pulseSnapshotSchema, type PulseSnapshot, type PulseStatus } from "./domain";

const statusLabels: Record<PulseStatus, string> = {
  "at-risk": "At risk",
  "off-track": "Off track",
  "on-track": "On track",
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const timestampFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function StateIcon({ kind }: { kind: "error" | "loading" }) {
  if (kind === "loading") return <span aria-hidden="true" className="pulse-loader" />;
  return (
    <svg aria-hidden="true" className="pulse-state-icon" viewBox="0 0 24 24">
      <path d="M12 8v5m0 3.5v.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function PulseState({
  description,
  loading = false,
  reportReady,
  title,
}: {
  description: string;
  loading?: boolean;
  reportReady?: () => void;
  title: string;
}) {
  const content = (
    <section aria-busy={loading || undefined} className="pulse-state" role={loading ? "status" : "alert"}>
      <StateIcon kind={loading ? "loading" : "error"} />
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
  return loading ? content : <ViewReady reportReady={reportReady}>{content}</ViewReady>;
}

function ActivityChart({ snapshot }: { snapshot: PulseSnapshot }) {
  const width = 720;
  const height = 236;
  const plot = { bottom: 190, left: 42, right: 694, top: 22 };
  const maximum = Math.max(...snapshot.trend.map((point) => point.completedTasks), 1);
  const xStep = (plot.right - plot.left) / (snapshot.trend.length - 1);
  const y = (value: number) => plot.bottom - (value / maximum) * (plot.bottom - plot.top);
  const points = snapshot.trend.map((point, index) => ({
    ...point,
    x: plot.left + index * xStep,
    y: y(point.completedTasks),
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const summary = points.map((point) => `${formatDate(point.date)}: ${point.completedTasks}`).join(", ");
  const peak = points.reduce((highest, point) =>
    point.completedTasks > highest.completedTasks ? point : highest,
  );

  return (
    <figure className="pulse-chart">
      <figcaption>
        <div>
          <h2>Task completions</h2>
          <p>Daily output during this seven-day snapshot</p>
        </div>
        <div className="pulse-chart-readout">
          <strong>{snapshot.metrics.completedTasks}<span> completed</span></strong>
          <span>Weekly high · {peak.completedTasks} on {formatDate(peak.date)}</span>
        </div>
      </figcaption>
      <div className="pulse-chart-scroll">
        <svg aria-labelledby="pulse-chart-title pulse-chart-description" role="img" viewBox={`0 0 ${width} ${height}`}>
          <title id="pulse-chart-title">Completed tasks over seven days</title>
          <desc id="pulse-chart-description">{summary}</desc>
          {[0, 0.33, 0.66, 1].map((ratio) => {
            const gridY = plot.bottom - ratio * (plot.bottom - plot.top);
            return <line className="pulse-chart-grid" key={ratio} x1={plot.left} x2={plot.right} y1={gridY} y2={gridY} />;
          })}
          <path className="pulse-chart-line" d={path} pathLength="1" />
          {points.map((point) => (
            <g key={point.date}>
              {point.date === peak.date ? (
                <circle className="pulse-chart-peak" cx={point.x} cy={point.y} r="9" />
              ) : null}
              <circle className="pulse-chart-point" cx={point.x} cy={point.y} r="4" />
              <text className="pulse-chart-value" textAnchor="middle" x={point.x} y={Math.max(14, point.y - 11)}>{point.completedTasks}</text>
              <text className="pulse-chart-label" textAnchor="middle" x={point.x} y="220">{formatDate(point.date)}</text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

function pulseNote(snapshot: PulseSnapshot) {
  const blockers = snapshot.metrics.openBlockers;
  if (snapshot.status === "off-track") {
    return `${blockers} blockers are holding the week back`;
  }
  if (snapshot.status === "at-risk") {
    return blockers >= 3
      ? `${blockers} blockers need a closer look`
      : `${snapshot.metrics.completionPercent}% complete, with momentum still building`;
  }
  return blockers === 0
    ? `Clear runway across ${Object.values(snapshot.work).reduce((sum, value) => sum + value, 0)} tracked tasks`
    : `${snapshot.metrics.completedTasks} tasks moved with ${blockers} blocker${blockers === 1 ? "" : "s"} open`;
}

const workLabels: Record<keyof PulseSnapshot["work"], string> = {
  blocked: "Blocked",
  completed: "Completed",
  inProgress: "In progress",
  notStarted: "Not started",
};

function WorkBreakdown({ work }: { work: PulseSnapshot["work"] }) {
  const entries = (Object.entries(work) as Array<[keyof typeof work, number]>).sort(
    ([left], [right]) => ["completed", "inProgress", "notStarted", "blocked"].indexOf(left)
      - ["completed", "inProgress", "notStarted", "blocked"].indexOf(right),
  );
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  return (
    <section aria-labelledby="pulse-work-heading" className="pulse-work">
      <header>
        <div>
          <h2 id="pulse-work-heading">Work breakdown</h2>
          <p>{total} tracked tasks</p>
        </div>
      </header>
      <div className="pulse-work-stack" aria-hidden="true">
        {entries.map(([key, value]) => (
          <span className={`pulse-work-segment ${key}`} key={key} style={{ width: `${(value / total) * 100}%` }} />
        ))}
      </div>
      <dl className="pulse-work-list">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt><span aria-hidden="true" className={`pulse-work-dot ${key}`} />{workLabels[key]}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PulseDashboard({ snapshot }: { snapshot: PulseSnapshot }) {
  const metrics = [
    ["Overall progress", `${snapshot.metrics.completionPercent}%`],
    ["Completed tasks", snapshot.metrics.completedTasks.toLocaleString("en")],
    ["Active contributors", snapshot.metrics.activeContributors.toLocaleString("en")],
    ["Open blockers", snapshot.metrics.openBlockers.toLocaleString("en")],
  ];

  return (
    <article className="pulse-root" data-design-seed="8d1308b2">
      <header className="pulse-header">
        <div>
          <h1>Northstar Pulse</h1>
          <p>
            {formatDate(snapshot.reportingPeriod.start)}–{formatDate(snapshot.reportingPeriod.end)}
            <span aria-hidden="true"> · </span>
            <span>Generated sample</span>
          </p>
        </div>
        <div className="pulse-header-meta">
          <span className={`pulse-status ${snapshot.status}`}>
            <span aria-hidden="true" />
            {statusLabels[snapshot.status]}
          </span>
          <span className="pulse-status-note">{pulseNote(snapshot)}</span>
          <time dateTime={snapshot.generatedAt}>Generated {timestampFormatter.format(new Date(snapshot.generatedAt))} UTC</time>
        </div>
      </header>

      <dl aria-label="Project pulse metrics" className="pulse-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="pulse-body">
        <ActivityChart snapshot={snapshot} />
        <WorkBreakdown work={snapshot.work} />
      </div>
    </article>
  );
}

export function PulseViewContent({
  isLoading,
  reportReady,
  value,
}: {
  isLoading: boolean;
  reportReady?: () => void;
  value: unknown;
}) {
  if (isLoading) {
    return <PulseState description="Reading the stored project snapshot…" loading title="Loading Northstar Pulse" />;
  }
  if (value === null || value === undefined) {
    return <PulseState description="Create a new Northstar Pulse resource to generate another sample." reportReady={reportReady} title="Pulse data is missing" />;
  }
  const parsed = pulseSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    return <PulseState description="This resource does not contain a valid Northstar Pulse snapshot." reportReady={reportReady} title="Pulse data is invalid" />;
  }
  return <ViewReady reportReady={reportReady}><PulseDashboard snapshot={parsed.data} /></ViewReady>;
}

function PulseKeyValueView({
  reportReady,
  storage,
}: {
  reportReady?: () => void;
  storage: ResourceStorageHandle;
}) {
  const snapshot = useKeyValue<unknown>(storage, PULSE_STORAGE_KEY);
  return <PulseViewContent isLoading={snapshot.isLoading} reportReady={reportReady} value={snapshot.value} />;
}

export function NorthstarPulseRenderer({ reportReady, storage }: ResourceViewProps) {
  const pulse = storage.pulse;
  if (pulse?.kind !== "key-value") {
    return <PulseState description="This resource is missing its key-value pulse storage." reportReady={reportReady} title="Pulse storage is unavailable" />;
  }
  return <PulseKeyValueView reportReady={reportReady} storage={pulse} />;
}
