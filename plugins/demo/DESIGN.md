---
name: Demo
description: A precise account ledger for synthetic SaaS operations.
colors:
  host-background: "var(--background, #ffffff)"
  host-surface: "var(--background, #ffffff)"
  graphite: "var(--foreground, #1c1917)"
  muted-graphite: "var(--muted-foreground, #78716c)"
  rule: "var(--border, #e7e5e4)"
  action: "var(--primary, #292524)"
  action-foreground: "var(--primary-foreground, #fafaf9)"
  healthy: "#079455"
  watch: "#b86400"
  risk: "#d92d20"
  shadow: "#000000"
typography:
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(1.1rem, 2vw, 1.35rem)"
    fontWeight: 670
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 650
    lineHeight: 1.35
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.25
  micro:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.35
  metric:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.2
rounded:
  control: "9px"
  compact: "7px"
  surface: "11px"
  pill: "999px"
spacing:
  tight: "8px"
  control: "12px"
  section: "22px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-foreground}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.host-surface}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.control}"
    padding: "0 9px"
    height: "32px"
---

# Design System: Demo

## Overview

**Creative North Star: "The Account Ledger"**

Demo behaves like a live operating record: compact, ruled, and exact. The
customer table is the visual anchor; metrics, filters, and activity exist to
make that ledger faster to interpret rather than to compete with it.

**Key Characteristics:**

- Continuous ruled surfaces instead of a grid of dashboard cards.
- Lunaris host neutrals and primary action colors without a plugin accent layer.
- Tabular numerals, compact labels, and restrained semantic status colors.
- Synthetic-data language that stays visible without dominating the work.

## Colors

Only variables forwarded by the Lunaris sandbox are used: background,
foreground, muted, muted foreground, primary, primary foreground, border, and
radius. Green, amber, and red communicate health only. Their foreground values
mix toward the host foreground to remain legible in light and dark themes.

**The Signal Color Rule.** Host primary means interaction. Green, amber, and red
mean state. Do not use them as decoration.

## Typography

One workhorse system stack serves headings, controls, and dense data. Hierarchy
comes from weight, size, and alignment; uppercase is limited to table headers.
IDs alone use the system monospace stack, and monetary values use tabular
numerals.

## Layout

The dashboard flows command bar → compact metric register → filter strip →
disclosed session activity → full-width ledger. Below 920px metrics become a
two-column register; below 680px controls wrap and the table scrolls
horizontally. The dossier uses a main narrative column and a narrow detail rail,
collapsing to one column below 920px.

## Elevation & Depth

The system is flat by default. Hairline rules and tonal surface changes carry
structure. Shadows are reserved for temporary top-layer UI such as action
popovers, confirmation dialogs, and notices.

## Shapes

Primary controls use 9px corners, compact controls use 7px, and temporary
surfaces use 10–14px. Pills are reserved for small statuses. The ledger itself
stays square and continuous; never turn it into a floating rounded card.

## Components

- **Metric register:** one compact ruled band with four definition-list values.
- **Ledger table:** semantic table, uppercase compact headers, tabular values,
  monogram marks, and horizontally scrollable narrow-panel behavior.
- **Status marks:** a dot-and-label health indicator plus small status pills.
- **Action popover:** viewport-level temporary surface with ordinary buttons,
  Escape/outside dismissal, and focus restoration.
- **Session activity:** a native disclosure keeps synthetic history available
  without competing with the ledger.
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
