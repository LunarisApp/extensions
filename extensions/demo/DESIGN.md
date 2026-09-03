---
name: Northstar Pulse
description: A compact, host-native project pulse rendered as a continuous ruled report.
colors:
  canvas: "var(--background, #ffffff)"
  ink: "var(--foreground, #1c1917)"
  muted: "var(--muted-foreground, #6b6762)"
  surface: "var(--muted, #f5f4f2)"
  rule: "var(--border, #dedbd7)"
  primary: "var(--primary, #292524)"
  healthy: "color-mix(in srgb, #079455 72%, var(--foreground, #1c1917))"
  watch: "color-mix(in srgb, #b86400 78%, var(--foreground, #1c1917))"
  risk: "color-mix(in srgb, #d92d20 76%, var(--foreground, #1c1917))"
typography:
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(1.35rem, 2.6vw, 2rem)"
    fontWeight: 680
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.45
  heading:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 680
    lineHeight: 1.3
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.3
  micro:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 500
    lineHeight: 1.35
  state-title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 680
    lineHeight: 1.3
  metric:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(1.45rem, 3vw, 2.25rem)"
    fontWeight: 670
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  status: "999px"
  data-mark: "2px"
spacing:
  compact: "9px"
  row: "12px"
  section: "24px"
  frame: "clamp(20px, 3.5vw, 44px)"
components:
  status-on-track:
    textColor: "{colors.healthy}"
    typography: "{typography.label}"
    rounded: "{rounded.status}"
    padding: "4px 9px"
    height: "27px"
  status-at-risk:
    textColor: "{colors.watch}"
    typography: "{typography.label}"
    rounded: "{rounded.status}"
    padding: "4px 9px"
    height: "27px"
  status-off-track:
    textColor: "{colors.risk}"
    typography: "{typography.label}"
    rounded: "{rounded.status}"
    padding: "4px 9px"
    height: "27px"
  work-strip:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.status}"
    height: "9px"
---

# Design System: Northstar Pulse

## Overview

**Creative North Star: "The Pulse Register"**

Northstar Pulse is a host-native project instrument: compact, calm, and exact. It reads as one continuous ruled report rather than a collection of interchangeable dashboard cards. The Pulse Register structure, identified by seed `8d1308b2`, establishes a deliberate scan path from status to four headline measures, across a dominant seven-day activity line, and into the adjacent work breakdown.

The system inherits the Lunaris theme and lets typography, tabular figures, and hairline rules carry the hierarchy. Synthetic-data language remains visible, status never relies on color alone, and the narrow layout preserves the same reading order by stacking instead of simplifying away information. Delight comes from useful annotation: a status-specific pulse note and a double-ring weekly high make the frozen sample feel thoughtfully interpreted rather than merely plotted.

**Key Characteristics:**

- Continuous ruled report with no floating cards
- Dominant accessible seven-day line chart
- Compact tabular measures and adjacent work breakdown
- Restrained semantic status color
- Data-derived status note and weekly-high annotation
- Host-native theming with a narrow responsive stack

## Colors

The palette is inherited graphite and paper, with green, amber, and red reserved for explicit project state.

### Primary

- **Host Graphite:** The host primary drives the activity line, chart points, completed-work segment, and loading signal.

### Neutral

- **Host Canvas:** The uninterrupted report background and the hollow center of chart points.
- **Report Ink:** Primary text, numeric values, and error-color mixing anchor.
- **Quiet Copy:** Supporting copy, timestamps, labels, and low-emphasis data marks.
- **Muted Surface:** The empty track behind the proportional work strip.
- **Hairline Rule:** Structural dividers, chart grid lines, and the loading ring.

### Semantic

- **Healthy Green:** On-track status only.
- **Watch Amber:** At-risk status only.
- **Risk Red:** Off-track status, blocked work, and terminal error iconography.

### Named Rules

**The Signal Color Rule.** Green, amber, and red communicate project state only; they never provide generic emphasis or decoration.

**The Host Theme Rule.** Canvas, ink, muted copy, rules, surfaces, and primary marks inherit Lunaris variables with explicit fallbacks.

## Typography

**Display Font:** Host system sans (`ui-sans-serif` with platform fallbacks)

**Body Font:** Host system sans (`ui-sans-serif` with platform fallbacks)

**Label/Mono Font:** Host system sans with tabular numerals for time and quantitative data

**Character:** One pragmatic system-sans family keeps the report native to its host. Weight, size, and tabular figures create hierarchy without introducing a separate display voice.

### Hierarchy

- **Title** (680, fluid `1.35rem`–`2rem`, 1.08): Names the report once at the top of the register.
- **Heading** (680, `0.875rem`, 1.3): Labels the chart and work breakdown.
- **Metric** (670, fluid `1.45rem`–`2.25rem`, 1): Gives the four headline values immediate scanning priority.
- **State Title** (680, `1.05rem`, 1.3): Anchors loading, missing-data, invalid-data, and unavailable-storage views.
- **Body** (400, `0.78rem`, 1.45): Supports periods, descriptions, and recovery guidance.
- **Label** (650, `0.75rem`, 1.3): Carries explicit status text and compact interface labels.
- **Micro** (500, `0.7rem`, 1.35): Handles timestamps, metric labels, and chart annotations; data uses tabular numerals.

### Named Rules

**The Tabular Scan Rule.** Timestamps, metric values, chart annotations, and work counts use tabular numerals so columns remain visually stable.

## Layout

The report is centered within a maximum width of `1180px` and uses fluid frame padding from `20px` to `44px`. At standard widths, the header and four-column metric register span the page. Below them, the activity chart is the dominant visualization at roughly two thirds of the lower grid while the work breakdown occupies the narrower adjacent column.

At `720px` and below, the header stacks, the metric register becomes two columns, and the chart and work breakdown form one vertical sequence. At `430px` and below, the two-column metric register remains intact while the chart keeps a `520px` minimum drawing width and scrolls horizontally so all seven labeled points remain legible.

## Elevation & Depth

The system uses no shadows. Depth comes from content hierarchy, the muted work-strip track, and one-pixel rules that divide the continuous canvas without turning regions into floating surfaces.

### Named Rules

**The Flat Register Rule.** Keep every region on one host canvas; use rules and spacing for structure, never elevation effects.

## Shapes

The form language is mostly square and linear. Hairline dividers establish the report grid, chart strokes use rounded ends for legibility, the small work markers use a restrained `2px` radius, and only status or progress-strip forms receive the fully rounded `999px` treatment. There are no rounded cards or ornamental silhouettes.

## Components

Components feel like precise parts of one reporting instrument rather than independent widgets.

### Status Mark

- **Shape:** A compact outlined pill (`999px` radius, `27px` minimum height) with a `6px` circular dot.
- **Color:** Text, outline, and dot share the appropriate semantic state color.
- **Pulse note:** A concise data-derived sentence names the blocker or momentum condition directly beneath the mark.
- **Accessibility:** The state is written explicitly as On track, At risk, or Off track; the dot is decorative.

### Metric Register

- **Structure:** Four definition-list cells with vertical rules and fluid internal spacing.
- **Typography:** Quiet labels sit over large tabular values with strong scale contrast.
- **Responsive behavior:** Four columns become two at `720px` and remain two across the narrowest supported panel.

### Activity Chart

- **Structure:** A semantic SVG figure with a prominent seven-day line, four horizontal rules, hollow points, visible daily values, date labels, and a double-ring weekly-high point.
- **Readout:** The total is explicitly labeled “completed,” while the weekly-high value and date sit beside it as an interpretive annotation.
- **Color:** Host graphite carries the line and points; muted text and hairline rules keep supporting marks subordinate.
- **Motion:** On open, the line traces once in `640ms` with confident deceleration while all points and labels remain visible; reduced motion shows the completed line immediately.
- **Accessibility:** The SVG has a title and generated description enumerating every date and completion value.
- **Responsive behavior:** It remains the dominant visualization; only the SVG drawing scrolls horizontally in the narrowest panel, keeping the chart heading and readout fixed and legible.

### Work Register

- **Structure:** A `9px` proportional strip sits above four ruled definition-list rows.
- **Color:** Completed, in-progress, and not-started segments use primary-to-neutral tones; only blocked work uses risk red.
- **Markers:** Small square dots (`7px`, `2px` radius) pair color with a written category and tabular count.

### Terminal State

- **Structure:** Loading and error states center a compact icon, state title, and a recovery-oriented sentence.
- **Behavior:** Loading uses a `700ms` linear ring animation; reduced-motion preference disables the animation while retaining the primary signal.
- **Accessibility:** Loading announces status and busy state, errors use alerts, and all terminal copy remains readable without icon interpretation.

## Do's and Don'ts

### Do:

- **Do** keep the complete pulse visible in one ordinary desktop viewport.
- **Do** preserve the status → metrics → seven-day activity → work-breakdown reading order at every width.
- **Do** pair every semantic color with explicit status or category text.
- **Do** keep “Generated sample” and the reporting period visible in the header.
- **Do** preserve accessible SVG naming, visible point values, reduced-motion behavior, and theme-aware contrast.

### Don't:

- **Don't** add editing controls, filters, tabs, settings, or navigation to this read-only report.
- **Don't** replace the continuous register with equal-sized cards or bento panels.
- **Don't** add gradients, glass, shadows, illustrations, or decorative chart effects.
- **Don't** use green, amber, or red for generic emphasis.
- **Don't** remove data or labels from the narrow layout; stack or scroll the existing report instead.
