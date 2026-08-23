import type { OperationEntry } from "./domain";

const MAX_VISIBLE_OPERATIONS = 7;

export function OperationsLog({ entries }: { entries: OperationEntry[] }) {
  const visibleEntries = entries.slice(0, MAX_VISIBLE_OPERATIONS);
  const countLabel =
    visibleEntries.length === entries.length
      ? `${entries.length} events`
      : `Latest ${visibleEntries.length} of ${entries.length}`;

  return (
    <details className="operations-log">
      <summary>
        <span>Session activity</span>
        <span>{countLabel}</span>
      </summary>
      <ol>
        {visibleEntries.map((entry) => (
          <li className={entry.tone} key={entry.id}>
            <span className="operation-mark" aria-hidden="true" />
            <div>
              <p>{entry.message}</p>
              <span className="operation-actor">{entry.actor}</span>
            </div>
            <time>{entry.time}</time>
          </li>
        ))}
      </ol>
      <p className="log-note">Includes synthetic history. Demo actions are not sent to a server.</p>
    </details>
  );
}
