import {
  PLUGIN_PROJECT_ROOT_ID,
  type PluginResourceActions,
  type PluginWorkspaceNavigation,
  useCurrentProject,
  useProjectResourceActions,
  useProjectResourcesMap,
  useWorkspaceAccess,
  useWorkspaceNavigation,
} from "@lunarisapp/plugin-sdk";
import { File02Icon, HugeiconsIcon, PlusSignIcon } from "@lunarisapp/ui/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccountActionPopover,
  ConfirmationDialog,
  type OpenAccountMenu,
  type PendingConfirmation,
} from "./account-actions";
import { AccountLedger } from "./account-ledger";
import {
  type AccountAction,
  type AccountFilters,
  applyAccountAction,
  CONTENT_TYPE_ID,
  type CustomerAccount,
  createOperationEntry,
  filterCustomers,
  findDossierResource,
  INITIAL_CUSTOMERS,
  INITIAL_OPERATIONS,
  type OperationEntry,
  type SortField,
  type SortState,
  sortCustomers,
} from "./domain";
import { OperationsLog } from "./operations-log";

const MENU_MARGIN = 8;
const MENU_WIDTH = 218;

interface DossierResourceTarget {
  name: string;
  resourceId: string;
  schemaVersion: number;
}

export function openDossierResource(
  navigation: Pick<PluginWorkspaceNavigation, "openResource">,
  resource: DossierResourceTarget,
) {
  navigation.openResource({
    resourceId: resource.resourceId,
    resourceTypeId: CONTENT_TYPE_ID,
    schemaVersion: resource.schemaVersion,
    title: resource.name,
  });
}

export function createDossierResource(
  actions: Pick<PluginResourceActions, "createResource">,
) {
  return actions.createResource({
    name: "Alder & Finch Labs — Customer dossier",
    parentId: PLUGIN_PROJECT_ROOT_ID,
    resourceTypeId: CONTENT_TYPE_ID,
  });
}

function getMenuPosition(customer: CustomerAccount, trigger: HTMLButtonElement) {
  const anchor = trigger.getBoundingClientRect();
  const menuHeight = customer.status === "trial" ? 176 : 140;
  const left = Math.max(
    MENU_MARGIN,
    Math.min(anchor.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - MENU_MARGIN),
  );
  const top =
    anchor.bottom + menuHeight + MENU_MARGIN > window.innerHeight
      ? Math.max(MENU_MARGIN, anchor.top - menuHeight - 6)
      : anchor.bottom + 6;
  return { left, top };
}

function getDossierActionState({
  canWrite,
  exists,
  isCreating,
  projectId,
}: {
  canWrite: boolean;
  exists: boolean;
  isCreating: boolean;
  projectId?: string | null;
}) {
  if (exists) return { disabled: false, hint: "", label: "Open sample dossier" };
  if (!projectId) {
    return {
      disabled: true,
      hint: "Open a project to create the sample dossier.",
      label: "Create sample dossier",
    };
  }
  if (!canWrite) {
    return {
      disabled: true,
      hint: "Content write access is required to create the sample dossier.",
      label: "Create sample dossier",
    };
  }
  if (isCreating) {
    return {
      disabled: true,
      hint: "Creating the persistent sample in this project.",
      label: "Creating dossier…",
    };
  }
  return { disabled: false, hint: "", label: "Create sample dossier" };
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
  const { projectId } = useCurrentProject();
  const projectResources = useProjectResourcesMap();
  const resourceActions = useProjectResourceActions();
  const navigation = useWorkspaceNavigation();
  const access = useWorkspaceAccess();
  const existingDossier = findDossierResource(projectResources);

  const visibleCustomers = useMemo(
    () => sortCustomers(filterCustomers(customers, filters), sort),
    [customers, filters, sort],
  );

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
    setOpenMenu({ customer, trigger, ...getMenuPosition(customer, trigger) });
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
      addOperation(`Organization ID copied for ${customer.name}`);
    } catch {
      setNotice(`Clipboard access is unavailable. Organization ID: ${customer.id}`);
      addOperation(`Clipboard access unavailable for ${customer.name}`, "warning");
    }
  };

  const handleDossier = async () => {
    if (existingDossier) {
      openDossierResource(navigation, {
        name: existingDossier.name ?? "Customer dossier",
        resourceId: existingDossier.resourceId,
        schemaVersion: existingDossier.schemaVersion,
      });
      return;
    }
    if (!projectId || !access.canWriteContent) return;

    setIsCreating(true);
    try {
      const created = await createDossierResource(resourceActions);
      if (!created) throw new Error("The host did not create the dossier.");
      addOperation("Sample dossier created for Alder & Finch Labs", "positive");
      setNotice("Sample customer dossier created.");
      openDossierResource(navigation, { ...created, schemaVersion: 1 });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown host error";
      setNotice(`Could not create the dossier. ${reason}`);
    } finally {
      setIsCreating(false);
    }
  };

  const dossierAction = getDossierActionState({
    canWrite: access.canWriteContent,
    exists: Boolean(existingDossier),
    isCreating,
    projectId,
  });

  return (
    <main className="demo-shell" data-design-seed="cb5fe784">
      <header className="demo-header">
        <div>
          <h1>Customer accounts</h1>
          <p>Synthetic data · Admin actions reset when this view closes.</p>
        </div>
        <div className="dossier-action">
          <button
            aria-describedby={dossierAction.hint ? "dossier-action-hint" : undefined}
            className="primary-button"
            disabled={dossierAction.disabled}
            type="button"
            onClick={handleDossier}
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={existingDossier ? File02Icon : PlusSignIcon}
              size={17}
              strokeWidth={2}
            />
            {dossierAction.label}
          </button>
          {dossierAction.hint ? (
            <p id="dossier-action-hint" role="status">{dossierAction.hint}</p>
          ) : null}
        </div>
      </header>

      <AccountLedger
        activity={<OperationsLog entries={operations} />}
        customers={customers}
        filters={filters}
        onCloseMenu={closeAccountMenu}
        onFilterChange={(changes) => setFilters((current) => ({ ...current, ...changes }))}
        onOpenMenu={handleOpenMenu}
        onSort={handleSort}
        openMenuCustomerId={openMenu?.customer.id}
        sort={sort}
        visibleCustomers={visibleCustomers}
      />

      {openMenu ? (
        <AccountActionPopover
          menu={openMenu}
          onAction={handleAccountAction}
          onClose={closeAccountMenu}
          onCopy={handleCopy}
        />
      ) : null}

      <ConfirmationDialog
        onCancel={() => setPending(null)}
        onConfirm={confirmAction}
        pending={pending}
      />

      <div className={`demo-notice ${notice ? "visible" : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </main>
  );
}
