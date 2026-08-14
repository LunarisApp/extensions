---
name: create-lunaris-mini-app
description: Use to create or revise Lunaris Mini Apps as self-contained interactive HTML files.
---

# Build a Lunaris Mini App

Produce one readable `.html` or `.htm` file that the user can upload into a
Lunaris Mini App item.

## Workflow

1. Establish the app's purpose, audience, content, interactions, data, and visual
   priority. Ask only for choices that materially change the result; otherwise
   state reasonable assumptions and proceed.
2. Design for a resizable document panel. Prefer a simple, responsive layout,
   clear labels, keyboard operation, visible focus, and sufficient contrast.
3. Put all HTML, CSS, JavaScript, data, and optional assets in one file.
4. Keep interaction and domain logic in small, testable functions. Document
   non-obvious rules, transformations, and assumptions near the relevant code.
5. Validate behavior and the constraints below. Fix problems before delivery.
6. Return the file path and brief upload instructions.

## Supported capabilities

- Standard HTML and inline CSS.
- Inline JavaScript and DOM events.
- Interactive controls, navigation, filtering, sorting, and disclosure patterns.
- Canvas and inline SVG for visualizations, illustrations, games, or diagrams.
- CSS transitions and animation that respect reduced-motion preferences.
- Embedded JSON or other static data.
- `data:` images and fonts.
- Runtime-created `blob:` images and media.
- Browser-native utilities such as `Math`, `Date`, and `Intl`.
- In-memory state while the iframe remains mounted.

Use system fonts when possible. Implement lightweight custom visuals with SVG or
Canvas. If a library is essential, inline its distributable code and retain its
license; the complete file must remain within the size limit.

## Runtime constraints

The host renders the file with `iframe srcdoc`, an opaque origin, and sandbox
permission `allow-scripts` only. It injects this CSP before uploaded content:

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

Build around these limits:

- Maximum source size: 5 MiB (5,242,880 bytes).
- Upload format: one `.html` or `.htm` file.
- No remote scripts, stylesheets, images, fonts, media, APIs, or analytics.
- No `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, or network imports.
- No iframes, embedded objects, workers, service workers, or WebAssembly.
- No `eval` or `new Function`.
- No form submission. Handle form-like interactions with JavaScript and call
  `preventDefault`; use `type="button"` for non-submit buttons.
- No popups, downloads, external navigation, modal dialogs, or host bridge.
- No camera, microphone, geolocation, clipboard, fullscreen, USB, MIDI, or
  similar device/browser permissions.
- No reliable `localStorage`, `sessionStorage`, IndexedDB, cookies, or other
  origin-bound persistence. The opaque origin may reject them.
- State resets when the panel reloads, closes, or reopens.

Mini Apps has no in-product AI authoring or source replacement. AI may create
the HTML externally, but the user uploads it manually. To publish a revision,
create a new Mini App item. The existing item retains its original downloadable
source, and uploading never changes its hierarchy title.

## Implementation guidance

- Use semantic elements and explicit `<label>` associations.
- Make layouts fluid; avoid assuming a fixed panel width or height.
- Give the experience a clear content hierarchy and obvious primary action.
- Show validation near relevant input and keep errors or empty states actionable.
- Handle missing, empty, invalid, and extreme input without breaking the UI.
- When the app performs calculations, identify units, rounding, and assumptions;
  never display `NaN` or `Infinity`.
- Prefer deterministic behavior. Do not imply live data when values are static.
- Escape or assign user-provided text with `textContent`, not `innerHTML`.
- Keep source understandable so the user can download and edit it later.

## Validation checklist

- Confirm the file opens and core interactions work without a server.
- Confirm every dependency and asset is inline or an allowed `data:` URL.
- Search for network-bearing attributes and APIs such as `src=`, `href=`,
  `fetch`, XHR, WebSocket, and module imports; remove prohibited uses.
- Confirm forms cannot submit or navigate.
- Exercise primary interaction flows, edge cases, and reset behavior. Verify any
  transformations or calculations independently.
- Check keyboard navigation, labels, focus visibility, contrast, and narrow-panel
  layout.
- Confirm the final file is at most 5,242,880 bytes.
- Do not launch Lunaris or upload the file unless the user asks for in-app
  testing.

## Delivery

Provide exactly one upload-ready HTML file unless the user requests alternatives.
Tell the user to install Mini Apps from Workspace Settings, enable it for the
project, create a Mini App item, open it, choose **Choose app**, and select the
file. Mention important assumptions and any capability intentionally omitted
because of the sandbox.
