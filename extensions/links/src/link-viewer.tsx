import {
  ContentRendererReady,
  type ContentTypeRendererProps,
  useProjectItemActions,
  useProjectItemName,
  useWorkspaceAccess,
  useWorkspaceNavigation,
} from "@lunarisapp/plugin-sdk";
import {
  useCurrentProjectYjsDocument,
  useYMapJson,
} from "@lunarisapp/plugin-sdk/data";
import {
  Alert02Icon,
  ArrowUpRight01Icon,
  Globe02Icon,
  HugeiconsIcon,
  Link01Icon,
  PencilEdit01Icon,
} from "@lunarisapp/ui/icons";
import { useEffect, useState } from "react";
import type { Doc as YDoc } from "yjs";
import {
  createLinkRecord,
  DEFAULT_LINK_RECORD,
  LINK_RECORD_KEY,
  LINKS_MAP_NAME,
  type LinkRecord,
  normalizeLinkUrl,
  parseLinkRecord,
} from "./domain";

export const LINKS_EXTENSION_ID = "lunaris.links";
export const LINKS_BROWSER_RENDERER = "browser";

const PANEL_UNAVAILABLE_ERROR =
  "This version of Lunaris cannot open extension panels. The link is still saved.";
const RENAME_FAILED_ERROR =
  "The link was saved, but its item name could not be updated.";

function linkViewId(itemId: string | undefined): string {
  return `${LINKS_EXTENSION_ID}.browser.${(itemId ?? "link").replace(/[^a-zA-Z0-9.-]/g, "-")}`;
}

interface LinkEditorProps {
  canCancel: boolean;
  canWrite: boolean;
  initialRecord: LinkRecord;
  onCancel: () => void;
  onSave: (record: LinkRecord, openAfterSave: boolean) => Promise<void>;
}

function LinkEditor({
  canCancel,
  canWrite,
  initialRecord,
  onCancel,
  onSave,
}: LinkEditorProps) {
  const [label, setLabel] = useState(initialRecord.label);
  const [url, setUrl] = useState(initialRecord.url);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (openAfterSave: boolean) => {
    const normalized = normalizeLinkUrl(url);
    if (!normalized.url) {
      setError(normalized.error);
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      await onSave(createLinkRecord(label, normalized.url), openAfterSave);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The link could not be saved. Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="links-shell links-editor-shell">
      <section className="links-editor" aria-labelledby="links-editor-title">
        <div className="links-mark" aria-hidden="true">
          <HugeiconsIcon icon={Link01Icon} size={28} />
        </div>
        <header>
          <h1 id="links-editor-title">
            {canCancel ? "Edit link" : "Attach a browser link"}
          </h1>
          <p>
            Keep a project website nearby and open it in a Lunaris panel.
          </p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(true);
          }}
        >
          <div className="links-field">
            <label htmlFor="link-address">Web address</label>
            <div className="links-address-input">
              <HugeiconsIcon aria-hidden="true" icon={Globe02Icon} size={17} />
              <input
                autoFocus
                disabled={!canWrite || isSaving}
                id="link-address"
                inputMode="url"
                onChange={(event) => {
                  setUrl(event.currentTarget.value);
                  if (error) setError(null);
                }}
                placeholder="https://example.com"
                spellCheck={false}
                type="text"
                value={url}
              />
            </div>
          </div>

          <div className="links-field">
            <label htmlFor="link-label">
              Label <span>Optional</span>
            </label>
            <input
              disabled={!canWrite || isSaving}
              id="link-label"
              maxLength={120}
              onChange={(event) => setLabel(event.currentTarget.value)}
              placeholder="Uses the website name when blank"
              type="text"
              value={label}
            />
          </div>

          {error ? (
            <p className="links-form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="links-form-actions">
            {canCancel ? (
              <button
                className="links-button links-button-quiet"
                disabled={isSaving}
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
            ) : null}
            <button
              className="links-button links-button-secondary"
              disabled={!canWrite || isSaving}
              onClick={() => void save(false)}
              type="button"
            >
              Save
            </button>
            <button
              className="links-button links-button-primary"
              disabled={!canWrite || isSaving}
              type="submit"
            >
              {isSaving ? "Saving…" : "Save & open"}
              {!isSaving ? (
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ArrowUpRight01Icon}
                  size={16}
                />
              ) : null}
            </button>
          </div>
        </form>

        {!canWrite ? (
          <p className="links-readonly-note">
            You need edit access to attach or change this link.
          </p>
        ) : null}
      </section>
    </main>
  );
}

function SavedLink({
  itemId,
  initialOperationError,
  record,
  reportReady,
  setRecord,
}: {
  itemId?: string;
  initialOperationError?: string | null;
  record: LinkRecord;
  reportReady?: () => void;
  setRecord: (record: LinkRecord) => void;
}) {
  const { canWriteContent } = useWorkspaceAccess();
  const navigation = useWorkspaceNavigation();
  const itemActions = useProjectItemActions();
  const itemName = useProjectItemName({ itemId });
  const [editing, setEditing] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(
    initialOperationError ?? null,
  );

  useEffect(() => {
    if (initialOperationError) setPanelError(initialOperationError);
  }, [initialOperationError]);

  const openInPanel = (
    nextRecord = record,
    existingError: string | null = null,
  ) => {
    setPanelError(existingError);
    const opened = navigation.openPanel({
      params: { title: nextRecord.label, url: nextRecord.url },
      pluginId: LINKS_EXTENSION_ID,
      renderer: LINKS_BROWSER_RENDERER,
      title: nextRecord.label,
      viewId: linkViewId(itemId),
    });
    if (!opened) {
      setPanelError(PANEL_UNAVAILABLE_ERROR);
    }
  };

  if (editing) {
    return (
      <LinkEditor
        canCancel
        canWrite={canWriteContent}
        initialRecord={record}
        onCancel={() => setEditing(false)}
        onSave={async (nextRecord, openAfterSave) => {
          let operationError: string | null = null;
          setRecord(nextRecord);
          if (itemId && itemName !== nextRecord.label) {
            try {
              await itemActions.rename(itemId, nextRecord.label);
            } catch {
              operationError = RENAME_FAILED_ERROR;
            }
          }
          setEditing(false);
          if (openAfterSave) {
            openInPanel(nextRecord, operationError);
          } else {
            setPanelError(operationError);
          }
        }}
      />
    );
  }

  const destination = new URL(record.url);
  const displayUrl = record.url.replace(/\/$/, "");

  return (
    <ContentRendererReady reportReady={reportReady}>
      <main className="links-shell links-saved-shell">
        <header className="links-toolbar">
          <div className="links-toolbar-title">
            <span className="links-favicon" aria-hidden="true">
              {destination.hostname.charAt(0).toUpperCase()}
            </span>
            <span>{record.label}</span>
          </div>
          <div className="links-toolbar-actions">
            {canWriteContent ? (
              <button
                aria-label="Edit link"
                className="links-icon-button"
                onClick={() => setEditing(true)}
                title="Edit link"
                type="button"
              >
                <HugeiconsIcon aria-hidden="true" icon={PencilEdit01Icon} size={17} />
              </button>
            ) : null}
            <button
              className="links-button links-button-primary"
              onClick={() => openInPanel()}
              type="button"
            >
              Open in panel
              <HugeiconsIcon
                aria-hidden="true"
                icon={ArrowUpRight01Icon}
                size={16}
              />
            </button>
          </div>
        </header>

        <section className="links-destination" aria-labelledby="link-title">
          <div className="links-domain-mark" aria-hidden="true">
            <HugeiconsIcon icon={Globe02Icon} size={30} />
          </div>
          <h1 id="link-title">{record.label}</h1>
          <p className="links-hostname">{destination.hostname}</p>

          <div className="links-address-strip">
            <HugeiconsIcon aria-hidden="true" icon={Link01Icon} size={17} />
            <span title={displayUrl}>{displayUrl}</span>
          </div>

          <p className="links-embed-note">
            This page opens in a sandboxed panel. Some websites may block
            embedded viewing or limit sign-in and forms.
          </p>

          {panelError ? (
            <p className="links-panel-error" role="alert">
              {panelError}
            </p>
          ) : null}
        </section>
      </main>
    </ContentRendererReady>
  );
}

function LinkDocument({
  document,
  itemId,
  reportReady,
}: {
  document: YDoc;
  itemId?: string;
  reportReady?: () => void;
}) {
  const linkMap = document.getMap<string>(LINKS_MAP_NAME);
  const [storedRecord, setStoredRecord] = useYMapJson<LinkRecord>(
    linkMap,
    LINK_RECORD_KEY,
    DEFAULT_LINK_RECORD,
  );
  const record = parseLinkRecord(storedRecord);
  const { canWriteContent } = useWorkspaceAccess();
  const itemActions = useProjectItemActions();
  const itemName = useProjectItemName({ itemId });
  const navigation = useWorkspaceNavigation();
  const [initialOperationError, setInitialOperationError] = useState<string | null>(
    null,
  );

  if (!record.url) {
    return (
      <ContentRendererReady reportReady={reportReady}>
        <LinkEditor
          canCancel={false}
          canWrite={canWriteContent}
          initialRecord={record}
          onCancel={() => undefined}
          onSave={async (nextRecord, openAfterSave) => {
            let operationError: string | null = null;
            setInitialOperationError(null);
            setStoredRecord(nextRecord);
            if (itemId && itemName !== nextRecord.label) {
              try {
                await itemActions.rename(itemId, nextRecord.label);
              } catch {
                operationError = RENAME_FAILED_ERROR;
              }
            }
            if (openAfterSave) {
              const opened = navigation.openPanel({
                params: { title: nextRecord.label, url: nextRecord.url },
                pluginId: LINKS_EXTENSION_ID,
                renderer: LINKS_BROWSER_RENDERER,
                title: nextRecord.label,
                viewId: linkViewId(itemId),
              });
              if (!opened) {
                operationError = PANEL_UNAVAILABLE_ERROR;
              }
            }
            setInitialOperationError(operationError);
          }}
        />
      </ContentRendererReady>
    );
  }

  return (
    <SavedLink
      itemId={itemId}
      initialOperationError={initialOperationError}
      record={record}
      reportReady={reportReady}
      setRecord={setStoredRecord}
    />
  );
}

function LinkState({
  description,
  loading = false,
  title,
}: {
  description: string;
  loading?: boolean;
  title: string;
}) {
  return (
    <main
      aria-busy={loading || undefined}
      className="links-state"
      role={loading ? undefined : "alert"}
    >
      {loading ? (
        <span className="links-loading-mark" aria-hidden="true" />
      ) : (
        <HugeiconsIcon aria-hidden="true" icon={Alert02Icon} size={24} />
      )}
      <h1>{title}</h1>
      <p>{description}</p>
    </main>
  );
}

export function LinkRenderer({
  documentId,
  itemId,
  reportReady,
}: ContentTypeRendererProps) {
  const documentState = useCurrentProjectYjsDocument(documentId);

  if (!documentId) {
    return (
      <LinkState
        description="Create a new Link item and try again."
        title="This link has no document"
      />
    );
  }
  if (documentState.isLoading) {
    return (
      <LinkState
        description="Reading the saved web address…"
        loading
        title="Loading link"
      />
    );
  }
  if (documentState.error || !documentState.yDoc) {
    return (
      <LinkState
        description={
          documentState.error?.message ??
          "Close the item and try opening it again."
        }
        title="Could not load this link"
      />
    );
  }

  return (
    <LinkDocument
      document={documentState.yDoc}
      itemId={itemId}
      reportReady={reportReady}
    />
  );
}
