# Northstar Pulse (Demo)

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People evaluating Lunaris extensions and developers learning how a resource type,
key-value storage, schema validation, and a resource-targeted view work together.

## Product Purpose

Northstar Pulse is a fictional workspace-health snapshot. Each resource generates
one coherent seven-day dataset when it is created, persists that dataset unchanged,
and presents it as a compact read-only dashboard when opened.

## Operating Context

The resource opens inside a Lunaris workspace panel. A reader should understand the
workspace status, headline measures, weekly activity, and remaining work in one scan,
including in a narrow secondary panel.

## Capabilities and Constraints

- Keep plugin ID `lunaris.demo` and version `0.0.1`.
- Register only the `lunaris.demo.northstar-pulse` resource type and its default view.
- Store one generated snapshot under the `snapshot` key of a key-value storage slot.
- Never regenerate or edit an existing snapshot.
- Use explicitly synthetic data and no external services or credentials.
- Request only the content-read permission needed to render the stored snapshot.

## Brand Commitments

The marketplace name is **Northstar Pulse (Demo)**. The view uses a direct, calm
workspace-reporting voice and makes its generated nature visible.

## Product Principles

- Demonstrate host capabilities through the real resource lifecycle.
- Keep the example small enough to understand from source.
- Prefer coherent data and scanability over decorative dashboard chrome.
- Keep every generated value clearly fictional.

## Accessibility & Inclusion

Use semantic definitions, explicit status text, accessible chart descriptions,
theme-aware contrast, reduced-motion support, and a layout that reflows in narrow panels.
