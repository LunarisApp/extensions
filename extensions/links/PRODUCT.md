# Links

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lunaris users who keep project-relevant websites close to the work and want to
open them without leaving the workspace.

## Product Purpose

Links adds a persistent Link item to the project hierarchy. Each item stores one
browser URL and a readable label, then opens that page in a Lunaris panel.
Success means attaching, recognizing, reopening, and editing a link takes only a
few direct actions.

## Positioning

Links treats a website as durable project content rather than as a transient
bookmark: it lives beside the rest of the project's hierarchy and opens in the
same panel system as other Lunaris content.

## Operating Context

Users create a Link while organizing project material, paste an address, and
usually open it immediately. Later they reopen it from the hierarchy or the
item action menu. Panels may be narrow and inherit either host theme.

## Capabilities and Constraints

- Store one HTTP or HTTPS address and label in each Yjs-backed Link item.
- Normalize addresses without a scheme to HTTPS and reject credentials or
  unsupported protocols.
- Open a saved page in a separate Lunaris panel through the public extension
  SDK.
- A remote site's `X-Frame-Options` or CSP can refuse embedded rendering. The
  extension cannot override site security policy.
- The host sandbox restricts page capabilities such as forms, popups, and
  origin storage. Links must not promise a full privileged browser session.

## Brand Commitments

Keep the public extension name “Links,” the ID `lunaris.links`, and a concise,
plainspoken product voice. The interface inherits Lunaris host tokens.

## Evidence on Hand

The public Lunaris extension SDK provides Yjs document storage, hierarchy item
actions, named renderers, and panel navigation. There is no host API
for bypassing a site's embedding policy or opening a privileged webview.

## Product Principles

- Make the saved destination obvious before opening it.
- Keep creation and editing in the durable Link item.
- Preserve the link even when its page cannot render in a panel.
- State browser and embedding limits without interrupting the primary flow.

## Accessibility & Inclusion

Use semantic forms and buttons, visible keyboard focus, theme-aware contrast,
announced errors, and a single-column layout that remains usable in narrow
panels.
