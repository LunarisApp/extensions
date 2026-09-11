# Northstar Pulse (Demo)

Explore a complete Lunaris extension through a small, read-only dashboard. Northstar
Pulse creates a fictional seven-day workspace snapshot so you can see how a resource
is created, stored, and displayed without connecting an external service.

**All values are synthetic.** This is a developer example, not workspace analytics.

## Use cases

- Learn how to connect a custom resource type to its default view.
- Use a working dashboard as a starting point for your own extension.
- Explore loading, invalid-data, and responsive chart states.

## Features

- A seven-day snapshot generated once when you create a resource.
- Workspace metrics and an accessible SVG trend chart.
- Stored data that stays the same when you reopen the dashboard.

## Try it

With the extension enabled in your workspace, create a **Northstar Pulse** resource.
The dashboard opens with generated data. Create another resource for a new snapshot;
existing snapshots cannot be edited through the view.

## Technology

Built with React and the Lunaris Plugin SDK. The resource initializer generates the
snapshot, Zod validates its schema, and host-managed key-value storage retains it.
A compatible default view reads the stored snapshot and handles loading and invalid data.

See [resource registration](src/index.tsx), [snapshot generation and schema](src/domain.ts),
and [dashboard rendering](src/dashboard.tsx).

### Permissions and privacy

Content read access displays the snapshot; content write access initializes it.
The extension makes no network requests.

## Development

Run from `extensions/demo`:

```sh
bun install
bun run test
bun run typecheck
bun run build
```
