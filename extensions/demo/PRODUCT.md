# Demo

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

SaaS operators evaluating a believable customer-administration workflow, and
extension developers inspecting a complete example of Lunaris view and resource
type integrations.

## Product Purpose

Demo is a synthetic SaaS operations console packaged as a Lunaris extension. It
lets an operator scan account health, filter a customer ledger, simulate common
admin actions, and create or open a read-only Customer dossier. Success means
the interface feels credible to an operator while remaining safe to explore and
clear enough to use as extension reference material.

## Positioning

Unlike a static component gallery, Demo connects a working operational view to
a real Lunaris resource type with host-backed creation, Yjs persistence, and
structured compilation, while keeping all SaaS account actions local and
synthetic.

## Operating Context

The surface is used as a dense desktop operations console, often while an
operator is triaging accounts, renewals, support cases, and access issues. It
must remain usable in narrow panels and follow the host's light or dark theme.

## Capabilities and Constraints

- Register the existing `lunaris.demo` primary view and the new
  `lunaris.demo.customer-dossier` resource type and its default view.
- Use clearly fictional companies, people, domains, metrics, and events.
- Simulated account mutations live only in component state and reset when the
  view remounts.
- Creating, opening, and persisting the sample dossier may use Lunaris SDK
  capabilities. The extension makes no external requests and uses no credentials.
- The dossier is a persistent but read-only sample and compiles to portable
  structured content.

## Brand Commitments

Keep the public extension name and ID as “Demo” and `lunaris.demo`. The interface
uses a direct, calm operator voice and labels synthetic data plainly.

## Evidence on Hand

There is no real customer data, commercial proof, or external service. All
displayed material is authored solely for demonstration and must never be
presented as production data.

## Product Principles

- Put operational clarity before decoration.
- Make every dangerous action explicit and reversible within the demo session.
- Demonstrate host capabilities through real integrations, not explanatory
  chrome.
- Keep synthetic data obviously synthetic without weakening its fidelity.

## Accessibility & Inclusion

Use semantic controls and tables, keyboard-visible focus, announced feedback,
theme-aware contrast, reduced-motion support, and layouts that remain operable
in narrow host panels.
