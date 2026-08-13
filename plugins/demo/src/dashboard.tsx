import {
  PLUGIN_PROJECT_ROOT_ID,
  useCurrentProject,
  useProjectItemActions,
  useProjectItemsMap,
  useWorkspaceAccess,
  useWorkspaceNavigation,
} from "@lunarisapp/plugin-sdk";
import {
  Activity01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock03Icon,
  Copy01Icon,
  File02Icon,
  FilterHorizontalIcon,
  HugeiconsIcon,
  MoreVerticalCircle01Icon,
  PlusSignIcon,
  Search01Icon,
  UserUnlock01Icon,
} from "@lunarisapp/ui/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyAccountAction,
  CONTENT_TYPE_ID,
  createOperationEntry,
  deriveMetrics,
  filterCustomers,
  findDossierItem,
  INITIAL_CUSTOMERS,
  INITIAL_OPERATIONS,
  sortCustomers,
  type AccountAction,
  type AccountFilters,
  type AccountHealth,
  type AccountStatus,
  type CustomerAccount,
  type OperationEntry,
  type SortField,
  type SortState,
} from "./domain";

const revenueTrend = [
  72, 75, 74, 77, 79, 78, 82, 85, 84, 88, 91, 89, 93, 94, 97, 101, 99, 103,
  106, 108, 111, 109, 114, 116, 119, 121, 124, 123, 128, 132,
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: value >= 100_000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function RevenueTrend() {
  const width = 360;
  const height = 74;
  const minimum = Math.min(...revenueTrend);
  const maximum = Math.max(...revenueTrend);
  const points = revenueTrend
    .map((value, index) => {
      const x = (index / (revenueTrend.length - 1)) * width;
      const y = height - ((value - minimum) / (maximum - minimum)) * (height - 12) - 6;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <figure className="revenue-trend" aria-label="Thirty-day monthly recurring revenue trend, up 8.4 percent">
      <figcaption>
        <span>30-day revenue</span>
        <strong>+8.4%</strong>
      </figcaption>
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1="0" x2={width} y1="68" y2="68" />
        <polyline points={points} />
        <circle cx={width} cy="6" r="3.5" />
      </svg>
      <div className="trend-axis"><span>30 days ago</span><span>Today</span></div>
    </figure>
  );
}

function MetricRegister({ customers }: { customers: CustomerAccount[] }) {
  const metrics = deriveMetrics(customers);
  return (
    <section className="metric-register" aria-label="Account metrics">
      <dl className="metric-list">
        <div>
          <dt>Active MRR</dt>
          <dd>{formatCurrency(metrics.currentMrr)}</dd>
          <span className="metric-change positive">↑ 6.8% this month</span>
        </div>
        <div>
          <dt>Net revenue retention</dt>
          <dd>{metrics.netRevenueRetention.toFixed(1)}%</dd>
          <span className="metric-change positive">↑ 2.1 points</span>
        </div>
        <div>
          <dt>At-risk accounts</dt>
          <dd>{metrics.atRisk}</dd>
          <span className="metric-change warning">{metrics.atRisk === 1 ? "Needs review" : "Need review"}</span>
        </div>
        <div>
          <dt>Open admin cases</dt>
          <dd>{metrics.openCases}</dd>
          <span className="metric-change">Across {metrics.accounts} accounts</span>
        </div>
      </dl>
      <RevenueTrend />
    </section>
  );
}

function HealthBadge({ health }: { health: AccountHealth }) {
  const labels: Record<AccountHealth, string> = {
    healthy: "Healthy",
    risk: "At risk",
    watch: "Watch",
  };
  return <span className={`health-badge ${health}`}><span aria-hidden="true" />{labels[health]}</span>;
}

function StatusBadge({ customer }: { customer: CustomerAccount }) {
  const label = customer.status === "trial" && customer.trialDaysLeft
    ? `Trial · ${customer.trialDaysLeft}d`
    : titleCase(customer.status);
  return <span className={`status-badge ${customer.status}`}>{label}</span>;
}

function SortButton({
  activeSort,
  field,
  label,
  onSort,
}: {
  activeSort: SortState;
  field: SortField;
  label: string;
  onSort: (field: SortField) => void;
}) {
  const active = activeSort.field === field;
  const icon = active && activeSort.direction === "desc" ? ArrowDown01Icon : ArrowUp01Icon;
  return (
    <button className="sort-button" type="button" onClick={() => onSort(field)}>
      {label}
      <HugeiconsIcon aria-hidden="true" icon={icon} size={12} strokeWidth={2} />
    </button>
  );
}

function AccountMenuButton({
  customer,
  open,
  onClose,
  onOpen,
}: {
  customer: CustomerAccount;
  open: boolean;
  onClose: () => void;
  onOpen: (customer: CustomerAccount, trigger: HTMLButtonElement) => void;
}) {
  return (
    <button
      aria-controls={open ? "account-actions-popover" : undefined}
      aria-expanded={open}
      className="account-menu-trigger"
      type="button"
      aria-label={`Actions for ${customer.name}`}
      onClick={(event) => {
        if (open) onClose();
        else onOpen(customer, event.currentTarget);
      }}
    >
      <HugeiconsIcon aria-hidden="true" icon={MoreVerticalCircle01Icon} size={18} strokeWidth={1.8} />
    </button>
  );
}

interface OpenAccountMenu {
  customer: CustomerAccount;
  left: number;
  top: number;
  trigger: HTMLButtonElement;
}

function AccountActionPopover({
  menu,
  onAction,
  onClose,
  onCopy,
}: {
  menu: OpenAccountMenu;
  onAction: (customer: CustomerAccount, action: AccountAction) => void;
  onClose: () => void;
  onCopy: (customer: CustomerAccount) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !menu.trigger.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const closeOnLayoutChange = () => onClose();
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnLayoutChange);
    window.addEventListener("scroll", closeOnLayoutChange, true);
    popoverRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnLayoutChange);
      window.removeEventListener("scroll", closeOnLayoutChange, true);
    };
  }, [menu.trigger, onClose]);

  const runAction = (action: AccountAction) => {
    onClose();
    onAction(menu.customer, action);
  };

  return (
    <div
      aria-label={`Actions for ${menu.customer.name}`}
      className="account-menu-popover"
      id="account-actions-popover"
      ref={popoverRef}
      role="group"
      style={{ left: menu.left, top: menu.top }}
    >
      <button type="button" onClick={() => { onClose(); onCopy(menu.customer); }}>
        <HugeiconsIcon aria-hidden="true" icon={Copy01Icon} size={16} />
        Copy organization ID
      </button>
      <button type="button" onClick={() => runAction("reset-2fa")}>
        <HugeiconsIcon aria-hidden="true" icon={UserUnlock01Icon} size={16} />
        Reset member 2FA
      </button>
      {menu.customer.status === "trial" ? (
        <button type="button" onClick={() => runAction("extend-trial")}>
          <HugeiconsIcon aria-hidden="true" icon={Clock03Icon} size={16} />
          Extend trial 7 days
        </button>
      ) : null}
      <div className="menu-separator" role="separator" />
      <button
        className={menu.customer.status === "suspended" ? "positive-action" : "danger-action"}
        type="button"
        onClick={() => runAction("toggle-suspension")}
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={menu.customer.status === "suspended" ? CheckmarkCircle02Icon : CancelCircleIcon}
          size={16}
        />
        {menu.customer.status === "suspended" ? "Reactivate workspace" : "Suspend workspace"}
      </button>
    </div>
  );
}

function OperationsLog({ entries }: { entries: OperationEntry[] }) {
  return (
    <aside className="operations-log" aria-labelledby="operations-heading">
      <div className="operations-heading">
        <div>
          <h2 id="operations-heading">Operations log</h2>
          <p>Synthetic fixture history + this session</p>
        </div>
        <span className="live-indicator"><span aria-hidden="true" />Demo</span>
      </div>
      <ol>
        {entries.slice(0, 7).map((entry) => {
          const icon = entry.tone === "danger"
            ? Alert02Icon
            : entry.tone === "positive"
              ? CheckmarkCircle02Icon
              : entry.tone === "warning"
                ? Alert02Icon
                : Activity01Icon;
          return (
            <li className={entry.tone} key={entry.id}>
              <HugeiconsIcon aria-hidden="true" icon={icon} size={18} strokeWidth={1.8} />
              <div>
                <p>{entry.message}</p>
                <span>{entry.actor}</span>
              </div>
              <time>{entry.time}</time>
            </li>
          );
        })}
      </ol>
      <p className="log-note">Demo actions are not sent to a server.</p>
    </aside>
  );
}

interface PendingConfirmation {
  action: "reset-2fa" | "toggle-suspension";
  customer: CustomerAccount;
}

export function AdminDashboard() {
  const [customers, setCustomers] = useState(() => INITIAL_CUSTOMERS.map((customer) => ({ ...customer })));
  const [filters, setFilters] = useState<AccountFilters>({ health: "all", search: "", status: "all" });
  const [sort, setSort] = useState<SortState>({ direction: "asc", field: "account" });
  const [operations, setOperations] = useState(INITIAL_OPERATIONS);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenAccountMenu | null>(null);
  const [notice, setNotice] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const confirmationRef = useRef<HTMLDialogElement>(null);
  const { projectId } = useCurrentProject();
  const projectItems = useProjectItemsMap();
  const itemActions = useProjectItemActions();
  const navigation = useWorkspaceNavigation();
  const access = useWorkspaceAccess();
  const existingDossier = findDossierItem(projectItems);

  const visibleCustomers = useMemo(
    () => sortCustomers(filterCustomers(customers, filters), sort),
    [customers, filters, sort],
  );

  useEffect(() => {
    const dialog = confirmationRef.current;
    if (pending && dialog && !dialog.open) dialog.showModal();
    if (!pending && dialog?.open) dialog.close();
  }, [pending]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const addOperation = (message: string, tone: OperationEntry["tone"] = "neutral") => {
    setOperations((current) => [createOperationEntry(message, tone), ...current]);
  };

  const handleSort = (field: SortField) => {
    setSort((current) => ({
      direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
      field,
    }));
  };

  const handleAccountAction = (customer: CustomerAccount, action: AccountAction) => {
    if (action === "extend-trial") {
      setCustomers((current) => applyAccountAction(current, customer.id, action));
      addOperation(`Trial extended by 7 days for ${customer.name}`, "positive");
      setNotice(`Trial extended for ${customer.name}.`);
      return;
    }
    setPending({ action, customer });
  };

  const handleOpenMenu = (customer: CustomerAccount, trigger: HTMLButtonElement) => {
    const anchor = trigger.getBoundingClientRect();
    const menuWidth = 218;
    const menuHeight = customer.status === "trial" ? 176 : 140;
    const left = Math.max(8, Math.min(anchor.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = anchor.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, anchor.top - menuHeight - 6)
      : anchor.bottom + 6;
    setOpenMenu({ customer, left, top, trigger });
  };

  const closeAccountMenu = useCallback(() => {
    if (openMenu?.trigger.isConnected) openMenu.trigger.focus();
    setOpenMenu(null);
  }, [openMenu]);

  const confirmAction = () => {
    if (!pending) return;
    const { action, customer } = pending;
    if (action === "reset-2fa") {
      addOperation(`Member 2FA reset simulated for ${customer.name}`, "warning");
      setNotice(`2FA reset simulated for ${customer.name}.`);
    } else {
      const reactivating = customer.status === "suspended";
      setCustomers((current) => applyAccountAction(current, customer.id, action));
      addOperation(
        `Workspace ${reactivating ? "reactivated" : "suspended"} for ${customer.name}`,
        reactivating ? "positive" : "danger",
      );
      setNotice(`${customer.name} was ${reactivating ? "reactivated" : "suspended"}.`);
    }
    setPending(null);
  };

  const handleCopy = async (customer: CustomerAccount) => {
    try {
      await navigator.clipboard.writeText(customer.id);
      setNotice(`${customer.id} copied to the clipboard.`);
    } catch {
      setNotice(`Clipboard access is unavailable. Organization ID: ${customer.id}`);
    }
    addOperation(`Organization ID copied for ${customer.name}`);
  };

  const openDossier = (item: { documentId: string | null; id: string; name: string }) => {
    navigation.openItem({
      documentId: item.documentId,
      itemId: item.id,
      pluginId: CONTENT_TYPE_ID,
      title: item.name,
    });
  };

  const handleDossier = async () => {
    if (existingDossier) {
      openDossier({
        documentId: existingDossier.documentId,
        id: existingDossier.id,
        name: existingDossier.name ?? "Customer dossier",
      });
      return;
    }
    if (!projectId || !access.canWriteContent) return;
    setIsCreating(true);
    try {
      const created = await itemActions.create({
        contentTypeId: CONTENT_TYPE_ID,
        name: "Alder & Finch Labs — Customer dossier",
        parentId: PLUGIN_PROJECT_ROOT_ID,
      });
      if (!created) throw new Error("The host did not create the dossier.");
      addOperation("Sample dossier created for Alder & Finch Labs", "positive");
      setNotice("Sample customer dossier created.");
      openDossier(created);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown host error";
      setNotice(`Could not create the dossier. ${reason}`);
    } finally {
      setIsCreating(false);
    }
  };

  const dossierDisabled = !existingDossier && (!projectId || !access.canWriteContent || isCreating);
  const dossierLabel = existingDossier ? "Open sample dossier" : isCreating ? "Creating dossier…" : "Create sample dossier";
  const dossierHint = existingDossier
    ? ""
    : !projectId
      ? "Open a project to create the sample dossier."
      : !access.canWriteContent
        ? "Content write access is required to create the sample dossier."
        : isCreating
          ? "Creating the persistent sample in this project."
          : "";
  const pendingReactivation = pending?.customer.status === "suspended";

  return (
    <main className="demo-shell" data-design-seed="cb5fe784">
      <header className="demo-header">
        <div>
          <div className="title-line">
            <h1>Customer operations</h1>
            <span className="synthetic-badge">Synthetic demo data</span>
          </div>
          <p>Monitor account health and rehearse common admin workflows safely.</p>
        </div>
        <div className="dossier-action">
          <button
            aria-describedby={dossierHint ? "dossier-action-hint" : undefined}
            className="primary-button"
            disabled={dossierDisabled}
            type="button"
            onClick={handleDossier}
          >
            <HugeiconsIcon aria-hidden="true" icon={existingDossier ? File02Icon : PlusSignIcon} size={17} strokeWidth={2} />
            {dossierLabel}
          </button>
          {dossierHint ? <p id="dossier-action-hint" role="status">{dossierHint}</p> : null}
        </div>
      </header>

      <MetricRegister customers={customers} />

      <section className="ledger-toolbar" aria-label="Customer ledger controls">
        <label className="search-field">
          <span className="sr-only">Search accounts</span>
          <HugeiconsIcon aria-hidden="true" icon={Search01Icon} size={17} />
          <input
            type="search"
            placeholder="Search name, domain, or ID"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </label>
        <div className="filter-group">
          <HugeiconsIcon aria-hidden="true" icon={FilterHorizontalIcon} size={17} />
          <label>
            <span className="sr-only">Filter by health</span>
            <select
              value={filters.health}
              onChange={(event) => setFilters((current) => ({
                ...current,
                health: event.target.value as AccountFilters["health"],
              }))}
            >
              <option value="all">Health: All</option>
              <option value="healthy">Healthy</option>
              <option value="watch">Watch</option>
              <option value="risk">At risk</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({
                ...current,
                status: event.target.value as AccountFilters["status"],
              }))}
            >
              <option value="all">Status: All</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
        </div>
        <p className="result-count"><strong>{visibleCustomers.length}</strong> of {customers.length} accounts</p>
      </section>

      <div className="workspace-grid">
        <section className="ledger-panel" aria-labelledby="ledger-heading">
          <h2 className="sr-only" id="ledger-heading">Customer ledger</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th aria-sort={sort.field === "account" ? `${sort.direction}ending` : "none"}>
                    <SortButton activeSort={sort} field="account" label="Account" onSort={handleSort} />
                  </th>
                  <th aria-sort={sort.field === "mrr" ? `${sort.direction}ending` : "none"}>
                    <SortButton activeSort={sort} field="mrr" label="Plan / MRR" onSort={handleSort} />
                  </th>
                  <th aria-sort={sort.field === "health" ? `${sort.direction}ending` : "none"}>
                    <SortButton activeSort={sort} field="health" label="Health" onSort={handleSort} />
                  </th>
                  <th>Seats</th>
                  <th>Last active</th>
                  <th aria-sort={sort.field === "renewal" ? `${sort.direction}ending` : "none"}>
                    <SortButton activeSort={sort} field="renewal" label="Renewal" onSort={handleSort} />
                  </th>
                  <th>Owner</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.length === 0 ? (
                  <tr><td className="empty-ledger" colSpan={8}>No accounts match these filters. Clear a filter or try another search.</td></tr>
                ) : visibleCustomers.map((customer) => (
                  <tr className={customer.status === "suspended" ? "suspended-row" : undefined} key={customer.id}>
                    <td>
                      <div className="account-cell">
                        <span className="account-mark" aria-hidden="true">{customer.initials}</span>
                        <div><strong>{customer.name}</strong><span>{customer.domain}</span></div>
                      </div>
                    </td>
                    <td><strong className="plan-name">{customer.plan}</strong><span className="cell-secondary">{formatCurrency(customer.mrr)} / mo</span></td>
                    <td><HealthBadge health={customer.health} /></td>
                    <td><span className="tabular">{customer.seatsUsed} / {customer.seatsLimit}</span></td>
                    <td>{customer.lastActive}</td>
                    <td>
                      <span>{customer.renewalDate}</span>
                      <span className={customer.renewalDays <= 10 ? "cell-secondary urgent" : "cell-secondary"}>
                        {customer.status === "trial" ? customer.trialDaysLeft : customer.renewalDays} days
                      </span>
                    </td>
                    <td><span className="owner-cell">{customer.owner}<StatusBadge customer={customer} /></span></td>
                    <td>
                      <AccountMenuButton
                        customer={customer}
                        open={openMenu?.customer.id === customer.id}
                        onClose={closeAccountMenu}
                        onOpen={handleOpenMenu}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <OperationsLog entries={operations} />
      </div>

      {openMenu ? (
        <AccountActionPopover
          menu={openMenu}
          onAction={handleAccountAction}
          onClose={closeAccountMenu}
          onCopy={handleCopy}
        />
      ) : null}

      <dialog
        aria-describedby="confirmation-description"
        aria-labelledby="confirmation-title"
        className="confirmation-dialog"
        ref={confirmationRef}
        onCancel={() => setPending(null)}
        onClose={() => setPending(null)}
      >
        {pending ? (
          <div>
            <span className={`dialog-icon ${pendingReactivation ? "positive" : "danger"}`}>
              <HugeiconsIcon
                aria-hidden="true"
                icon={pendingReactivation ? CheckmarkCircle02Icon : Alert02Icon}
                size={22}
              />
            </span>
            <h2 id="confirmation-title">
              {pending.action === "reset-2fa"
                ? "Reset member 2FA?"
                : pendingReactivation
                  ? "Reactivate this workspace?"
                  : "Suspend this workspace?"}
            </h2>
            <p id="confirmation-description">
              {pending.action === "reset-2fa"
                ? `This will simulate clearing a member’s second factor for ${pending.customer.name}.`
                : `This session-only action will ${pendingReactivation ? "restore" : "block"} access for ${pending.customer.name}.`}
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPending(null)}>Cancel</button>
              <button
                className={pendingReactivation ? "primary-button" : "danger-button"}
                type="button"
                onClick={confirmAction}
              >
                {pending.action === "reset-2fa" ? "Simulate reset" : pendingReactivation ? "Reactivate" : "Suspend workspace"}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>

      <div className={`demo-notice ${notice ? "visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </main>
  );
}
