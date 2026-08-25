# Demo

Curated reference extension that presents a synthetic SaaS customer-operations
console. It contributes:

- a primary view with derived metrics, customer filtering and sorting, local
  admin-action simulations, and an operations log;
- a user-creatable Customer dossier resource type with Yjs-backed sample data,
  a default resource view, and structured compilation for host export.

Every company, domain, person, metric, and event is fictional. Simulated account
actions reset when the view remounts and never make network requests. Only
creating, opening, and persisting the sample dossier uses Lunaris host
capabilities.

```sh
bun install
bun test
bun run typecheck
bun run build
```

External extensions run in opaque-origin sandboxed iframes and reach Lunaris only
through validated SDK capabilities. This extension reads the active project
resource map to open the first dossier and requests content-write access only
when it must create one. Additional dossiers remain available through generic
resource creation. It does not read unrelated document content, use
credentials, or perform host-proxied networking.
