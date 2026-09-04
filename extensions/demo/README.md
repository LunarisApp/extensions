# Northstar Pulse (Demo)

A compact reference extension for Lunaris resource types. Creating a **Northstar
Pulse** resource generates a fictional seven-day project snapshot, stores it once
in host-managed key-value storage, and opens it in a read-only dashboard view.

The example focuses on the complete resource lifecycle without external services:

- user-creatable resource type with schema-validated key-value storage;
- random data generated once during resource initialization;
- a compatible default view with loading and invalid-data states;
- a responsive, accessible SVG trend chart and semantic project metrics.

```sh
bun install
bun test
bun run typecheck
bun run build
```

All displayed values are synthetic. The extension requests content read access
to display its stored snapshot and content write access to initialize it. It
makes no network requests and provides no editing path after creation.
