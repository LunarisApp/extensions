import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock03Icon,
  Copy01Icon,
  HugeiconsIcon,
  MoreVerticalCircle01Icon,
  UserUnlock01Icon,
} from "@lunarisapp/ui/icons";
import { useEffect, useRef } from "react";
import type { AccountAction, CustomerAccount } from "./domain";

export interface OpenAccountMenu {
  customer: CustomerAccount;
  left: number;
  top: number;
  trigger: HTMLButtonElement;
}

export interface PendingConfirmation {
  action: "reset-2fa" | "toggle-suspension";
  customer: CustomerAccount;
}

export function AccountMenuButton({
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
      aria-label={`Actions for ${customer.name}`}
      className="account-menu-trigger"
      type="button"
      onClick={(event) => {
        if (open) onClose();
        else onOpen(customer, event.currentTarget);
      }}
    >
      <HugeiconsIcon aria-hidden="true" icon={MoreVerticalCircle01Icon} size={18} strokeWidth={1.8} />
    </button>
  );
}

export function AccountActionPopover({
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
  const popoverRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !menu.trigger.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    popoverRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [menu.trigger, onClose]);

  const runAction = (action: AccountAction) => {
    onClose();
    onAction(menu.customer, action);
  };

  return (
    <fieldset
      aria-label={`Actions for ${menu.customer.name}`}
      className="account-menu-popover"
      id="account-actions-popover"
      ref={popoverRef}
      style={{ left: menu.left, top: menu.top }}
    >
      <button
        type="button"
        onClick={() => {
          onClose();
          onCopy(menu.customer);
        }}
      >
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
      <hr className="menu-separator" />
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
    </fieldset>
  );
}

export function ConfirmationDialog({
  onCancel,
  onConfirm,
  pending,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  pending: PendingConfirmation | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (pending && dialog && !dialog.open) dialog.showModal();
    if (!pending && dialog?.open) dialog.close();
  }, [pending]);

  const reactivating = pending?.customer.status === "suspended";
  return (
    <dialog
      aria-describedby="confirmation-description"
      aria-labelledby="confirmation-title"
      className="confirmation-dialog"
      ref={dialogRef}
      onCancel={onCancel}
      onClose={onCancel}
    >
      {pending ? (
        <div>
          <span className={`dialog-icon ${reactivating ? "positive" : "danger"}`}>
            <HugeiconsIcon
              aria-hidden="true"
              icon={reactivating ? CheckmarkCircle02Icon : Alert02Icon}
              size={22}
            />
          </span>
          <h2 id="confirmation-title">
            {pending.action === "reset-2fa"
              ? "Reset member 2FA?"
              : reactivating
                ? "Reactivate this workspace?"
                : "Suspend this workspace?"}
          </h2>
          <p id="confirmation-description">
            {pending.action === "reset-2fa"
              ? `This will simulate clearing a member’s second factor for ${pending.customer.name}.`
              : `This session-only action will ${reactivating ? "restore" : "block"} access for ${pending.customer.name}.`}
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={onCancel}>
              Cancel
            </button>
            <button
              className={reactivating ? "primary-button" : "danger-button"}
              type="button"
              onClick={onConfirm}
            >
              {pending.action === "reset-2fa"
                ? "Simulate reset"
                : reactivating
                  ? "Reactivate"
                  : "Suspend workspace"}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
