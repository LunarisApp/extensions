import { ViewReady, type ResourceViewProps } from "@lunarisapp/plugin-sdk";
import { useCurrentProjectYjsDocument, useYMapJson } from "@lunarisapp/plugin-sdk/data";
import { Alert02Icon, Calendar03Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import {
  type CustomerDossier,
  DEFAULT_DOSSIER,
  DOSSIER_MAP_NAME,
  DOSSIER_RECORD_KEY,
  parseDossierRecord,
} from "./domain";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

type ReadyYDoc = NonNullable<ReturnType<typeof useCurrentProjectYjsDocument>["yDoc"]>;

function DossierDocument({ document, reportReady }: { document: ReadyYDoc; reportReady?: () => void }) {
  const dossierMap = document.getMap<string>(DOSSIER_MAP_NAME);
  const [storedDossier] = useYMapJson<CustomerDossier>(dossierMap, DOSSIER_RECORD_KEY, DEFAULT_DOSSIER);
  const dossier = parseDossierRecord(storedDossier);
  const seatPercent = Math.round((dossier.seatsUsed / dossier.seatsLimit) * 100);

  return (
    <ViewReady reportReady={reportReady}>
      <article className="dossier-shell" data-design-seed="cb5fe784">
        <header className="dossier-header">
          <div className="dossier-title">
            <div>
              <h1>{dossier.company}</h1>
              <p>{dossier.domain} · Read-only synthetic sample</p>
            </div>
          </div>
          <div className={`dossier-health ${dossier.health}`}>
            <span aria-hidden="true" />
            {dossier.health === "healthy" ? "Healthy" : dossier.health === "risk" ? "At risk" : "Watch"}
          </div>
        </header>

        <section className="dossier-register" aria-label="Customer account summary">
          <dl>
            <div>
              <dt>Plan</dt>
              <dd>{dossier.plan}</dd>
            </div>
            <div>
              <dt>Monthly revenue</dt>
              <dd>{formatCurrency(dossier.mrr)}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{dossier.owner}</dd>
            </div>
            <div>
              <dt>Renewal</dt>
              <dd>{dossier.renewalDate}</dd>
            </div>
            <div>
              <dt>Organization ID</dt>
              <dd className="dossier-id">{dossier.organizationId}</dd>
            </div>
          </dl>
        </section>

        <div className="dossier-grid">
          <div className="dossier-main">
            <section className="dossier-section" aria-labelledby="health-signals-heading">
              <div className="section-heading">
                <div>
                  <h2 id="health-signals-heading">Health signals</h2>
                  <p>Signals needing operator attention</p>
                </div>
              </div>
              <ul className="risk-list">
                {dossier.risks.map((risk) => (
                  <li key={risk.label}>
                    <div>
                      <strong>{risk.label}</strong>
                      <p>{risk.detail}</p>
                    </div>
                    <span className={`severity-label ${risk.severity}`}>{risk.severity}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="dossier-section" aria-labelledby="timeline-heading">
              <div className="section-heading">
                <div>
                  <h2 id="timeline-heading">Recent timeline</h2>
                  <p>Latest account moments</p>
                </div>
              </div>
              <ol className="timeline-list">
                {dossier.timeline.map((event) => (
                  <li key={`${event.date}-${event.title}`}>
                    <time>{event.date}</time>
                    <span aria-hidden="true" />
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="dossier-section operator-notes" aria-labelledby="operator-notes-heading">
              <div className="section-heading">
                <div>
                  <h2 id="operator-notes-heading">Operator notes</h2>
                  <p>Persisted with this dossier</p>
                </div>
              </div>
              <p>{dossier.notes}</p>
            </section>
          </div>

          <aside className="dossier-aside" aria-label="Customer details">
            <section className="dossier-section seat-usage">
              <div className="section-heading compact">
                <div>
                  <h2>Seat usage</h2>
                  <p>
                    {dossier.seatsUsed} of {dossier.seatsLimit} assigned
                  </p>
                </div>
                <span className="seat-percent">{seatPercent}%</span>
              </div>
              <div
                className="seat-track"
                role="progressbar"
                aria-label="Seat usage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={seatPercent}
              >
                <span style={{ width: `${seatPercent}%` }} />
              </div>
            </section>

            <section className="dossier-section" aria-labelledby="stakeholders-heading">
              <div className="section-heading compact">
                <div>
                  <h2 id="stakeholders-heading">Stakeholders</h2>
                  <p>Fictional contacts</p>
                </div>
              </div>
              <ul className="stakeholder-list">
                {dossier.stakeholders.map((person) => (
                  <li key={person.email}>
                    <span className="stakeholder-mark" aria-hidden="true">
                      {person.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <div>
                      <strong>{person.name}</strong>
                      <span>{person.role}</span>
                      <span className="stakeholder-email">{person.email}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </article>
    </ViewReady>
  );
}

export function CustomerDossierRenderer({ reportReady, storage }: ResourceViewProps) {
  const documentId = storage.kind === "yjs" ? storage.documentId : "";
  const documentState = useCurrentProjectYjsDocument(documentId);

  if (!documentId) {
    return (
      <section className="dossier-state error" role="alert">
        <HugeiconsIcon aria-hidden="true" icon={Alert02Icon} size={24} />
        <h1>This dossier has no document</h1>
        <p>Create a new Customer dossier from the Demo dashboard to load the sample record.</p>
      </section>
    );
  }

  if (documentState.isLoading) {
    return (
      <section className="dossier-state loading" aria-busy="true">
        <span className="loading-mark" aria-hidden="true" />
        <h1>Loading customer dossier</h1>
        <p>Reading the persisted sample record…</p>
      </section>
    );
  }

  if (documentState.error || !documentState.yDoc) {
    return (
      <section className="dossier-state error" role="alert">
        <HugeiconsIcon aria-hidden="true" icon={Alert02Icon} size={24} />
        <h1>Could not load this dossier</h1>
        <p>{documentState.error?.message ?? "Close the item and try opening it again."}</p>
      </section>
    );
  }

  return <DossierDocument document={documentState.yDoc} reportReady={reportReady} />;
}

export function DossierStatusBar() {
  return (
    <span className="dossier-statusbar">
      <HugeiconsIcon aria-hidden="true" icon={Calendar03Icon} size={13} />
      Read-only synthetic sample
    </span>
  );
}
