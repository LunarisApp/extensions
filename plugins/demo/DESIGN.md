---
name: Demo
description: A precise account ledger for synthetic SaaS operations.
colors:
  host-background: "var(--background, #f6f7f9)"
  host-surface: "var(--card, #ffffff)"
  graphite: "var(--foreground, #151923)"
  muted-graphite: "var(--muted-foreground, #5c6472)"
  rule: "var(--border, #dfe3e9)"
  cobalt: "#0b63e5"
  healthy: "#087b49"
  watch: "#9b5c00"
  risk: "#bc2435"
typography:
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(1.18rem, 2vw, 1.48rem)"
    fontWeight: 670
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 650
    lineHeight: 1.25
rounded:
  control: "9px"
  compact: "7px"
  surface: "11px"
spacing:
  tight: "8px"
  control: "12px"
  section: "22px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "8px 13px"
    height: "38px"
  input:
    backgroundColor: "{colors.host-surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.control}"
    padding: "0 11px"
    height: "38px"
---

# Design System: Demo

## Overview

**Creative North Star: "The Account Ledger"**

Demo behaves like a live operating record: compact, ruled, and exact. The
customer table is the visual anchor; metrics, filters, and activity exist to
make that ledger faster to interpret rather than to compete with it.

**Key Characteristics:**

- Continuous ruled surfaces instead of a grid of dashboard cards.
- Graphite hierarchy with cobalt reserved for focus and primary action.
- Tabular numerals, compact labels, and restrained semantic status colors.
- Synthetic-data language that stays visible without dominating the work.

## Colors

Host background, surface, text, muted text, input, and border variables are the
source of truth so the plugin follows Lunaris themes. Cobalt is the sole action
accent; green, amber, and red communicate health only. Their foreground values
mix toward the host foreground to remain legible in light and dark themes.

**The Signal Color Rule.** Cobalt means interaction. Green, amber, and red mean
state. Do not use them as decoration.

## Typography

One workhorse system stack serves headings, controls, and dense data. Hierarchy
comes from weight, size, and alignment; uppercase is limited to table headers.
IDs alone use the system monospace stack, and monetary values use tabular
numerals.

## Layout

The dashboard flows command bar → continuous metric register → filter strip →
ledger with a 300px operations rail. At 1120px the rail moves below the table;
at 820px metrics become a two-column register; at 560px controls stack and the
table scrolls horizontally. The dossier uses a main narrative column and a
narrow detail rail, collapsing to one column below 820px.

## Elevation & Depth

The system is flat by default. Hairline rules and tonal surface changes carry
structure. Shadows are reserved for temporary top-layer UI such as action
popovers, confirmation dialogs, and notices.

## Shapes

Primary controls use 9px corners, compact controls use 7px, and temporary
surfaces use 10–14px. Pills are reserved for small statuses. The ledger itself
stays square and continuous; never turn it into a floating rounded card.

## Components

- **Metric register:** one ruled band with four definition-list values and a
  compact, labeled revenue line chart.
- **Ledger table:** semantic table, uppercase compact headers, tabular values,
  monogram marks, and horizontally scrollable narrow-panel behavior.
- **Status marks:** a dot-and-label health indicator plus small status pills.
- **Action popover:** viewport-level temporary surface with ordinary buttons,
  Escape/outside dismissal, and focus restoration.
- **Dossier sections:** open ruled sections with no nested card stack; the
  account register and timeline carry the hierarchy.

## Do's and Don'ts

### Do:

- **Do** inherit host theme variables and provide explicit fallbacks.
- **Do** keep synthetic-data and session-local behavior plainly labeled.
- **Do** use semantic tables, controls, progress, dialogs, and live regions.

### Don't:

- **Don't** replace the ledger with equal-sized KPI cards or bento panels.
- **Don't** add gradients, glass, decorative charts, or image-native filler.
- **Don't** use status colors for generic emphasis or imply simulated data is live.
