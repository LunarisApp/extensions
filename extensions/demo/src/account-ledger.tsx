import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  HugeiconsIcon,
  Search01Icon,
} from "@lunarisapp/ui/icons";
import type { ReactNode } from "react";
import { AccountMenuButton } from "./account-actions";
import {
  type AccountFilters,
  type AccountHealth,
  type CustomerAccount,
  deriveMetrics,
  type SortField,
  type SortState,
} from "./domain";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: value >= 100_000 ? "compact" : "standard",
    style: "currency",
  }).format(value);
}

function MetricRegister({ customers }: { customers: CustomerAccount[] }) {
  const metrics = deriveMetrics(customers);
  return (
    <section className="metric-register" aria-label="Account metrics">
      <dl className="metric-list">
        <div>
          <dt>Active MRR</dt>
          <dd>{formatCurrency(metrics.currentMrr)}</dd>
        </div>
        <div>
          <dt>Net retention</dt>
          <dd>{metrics.netRevenueRetention.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>At risk</dt>
          <dd>{metrics.atRisk}</dd>
        </div>
        <div>
          <dt>Open cases</dt>
          <dd>{metrics.openCases}</dd>
        </div>
      </dl>
    </section>
  );
}

function HealthBadge({ health }: { health: AccountHealth }) {
  const labels: Record<AccountHealth, string> = {
    healthy: "Healthy",
    risk: "At risk",
    watch: "Watch",
  };
  return (
    <span className={`health-badge ${health}`}>
      <span aria-hidden="true" />
      {labels[health]}
    </span>
  );
}

function StatusBadge({ customer }: { customer: CustomerAccount }) {
  const status = customer.status.charAt(0).toUpperCase() + customer.status.slice(1);
  const label =
    customer.status === "trial" && customer.trialDaysLeft
      ? `Trial · ${customer.trialDaysLeft}d`
      : status;
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

function LedgerToolbar({
  customerCount,
  filters,
  onFilterChange,
  visibleCount,
}: {
  customerCount: number;
  filters: AccountFilters;
  onFilterChange: (changes: Partial<AccountFilters>) => void;
  visibleCount: number;
}) {
  return (
    <section className="ledger-toolbar" aria-label="Customer ledger controls">
      <label className="search-field">
        <span className="sr-only">Search accounts</span>
        <HugeiconsIcon aria-hidden="true" icon={Search01Icon} size={17} />
        <input
          type="search"
          placeholder="Search name, domain, or ID"
          value={filters.search}
          onChange={(event) => onFilterChange({ search: event.target.value })}
        />
      </label>
      <div className="filter-group">
        <label>
          <span className="sr-only">Filter by health</span>
          <select
            value={filters.health}
            onChange={(event) => onFilterChange({ health: event.target.value as AccountFilters["health"] })}
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
            onChange={(event) => onFilterChange({ status: event.target.value as AccountFilters["status"] })}
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </div>
      <p className="result-count">
        <strong>{visibleCount}</strong> of {customerCount} accounts
      </p>
    </section>
  );
}

export function AccountLedger({
  activity,
  customers,
  filters,
  onCloseMenu,
  onFilterChange,
  onOpenMenu,
  onSort,
  openMenuCustomerId,
  sort,
  visibleCustomers,
}: {
  activity: ReactNode;
  customers: CustomerAccount[];
  filters: AccountFilters;
  onCloseMenu: () => void;
  onFilterChange: (changes: Partial<AccountFilters>) => void;
  onOpenMenu: (customer: CustomerAccount, trigger: HTMLButtonElement) => void;
  onSort: (field: SortField) => void;
  openMenuCustomerId?: string;
  sort: SortState;
  visibleCustomers: CustomerAccount[];
}) {
  const sortAria = (field: SortField) =>
    sort.field === field ? (`${sort.direction}ending` as const) : "none";

  return (
    <>
      <MetricRegister customers={customers} />
      <LedgerToolbar
        customerCount={customers.length}
        filters={filters}
        onFilterChange={onFilterChange}
        visibleCount={visibleCustomers.length}
      />
      {activity}
      <section className="ledger-panel" aria-labelledby="ledger-heading">
        <h2 className="sr-only" id="ledger-heading">Customer ledger</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th aria-sort={sortAria("account")}>
                  <SortButton activeSort={sort} field="account" label="Account" onSort={onSort} />
                </th>
                <th aria-sort={sortAria("mrr")}>
                  <SortButton activeSort={sort} field="mrr" label="Plan / MRR" onSort={onSort} />
                </th>
                <th aria-sort={sortAria("health")}>
                  <SortButton activeSort={sort} field="health" label="Health" onSort={onSort} />
                </th>
                <th>Seats</th>
                <th>Last active</th>
                <th aria-sort={sortAria("renewal")}>
                  <SortButton activeSort={sort} field="renewal" label="Renewal" onSort={onSort} />
                </th>
                <th>Owner</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.length === 0 ? (
                <tr>
                  <td className="empty-ledger" colSpan={8}>
                    No accounts match these filters. Clear a filter or try another search.
                  </td>
                </tr>
              ) : (
                visibleCustomers.map((customer) => (
                  <tr className={customer.status === "suspended" ? "suspended-row" : undefined} key={customer.id}>
                    <td>
                      <div className="account-cell">
                        <strong>{customer.name}</strong>
                        <span>{customer.domain}</span>
                      </div>
                    </td>
                    <td>
                      <strong className="plan-name">{customer.plan}</strong>
                      <span className="cell-secondary">{formatCurrency(customer.mrr)} / mo</span>
                    </td>
                    <td><HealthBadge health={customer.health} /></td>
                    <td><span className="tabular">{customer.seatsUsed} / {customer.seatsLimit}</span></td>
                    <td>{customer.lastActive}</td>
                    <td>
                      <span>{customer.renewalDate}</span>
                      <span className={customer.renewalDays <= 10 ? "cell-secondary urgent" : "cell-secondary"}>
                        {customer.status === "trial" ? customer.trialDaysLeft : customer.renewalDays} days
                      </span>
                    </td>
                    <td>
                      <span className="owner-cell">
                        {customer.owner}
                        <StatusBadge customer={customer} />
                      </span>
                    </td>
                    <td>
                      <AccountMenuButton
                        customer={customer}
                        open={openMenuCustomerId === customer.id}
                        onClose={onCloseMenu}
                        onOpen={onOpenMenu}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
