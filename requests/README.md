# Requests for extensions

Help build the next Lunaris extension. These briefs describe useful workflows that
open-source contributors can take on, with a bounded first release and clear
acceptance criteria. Inclusion is not a promise of implementation or funding.

## Open and completed requests

| Proposal | Outcome | Estimated effort | Status | Implementation issue / PR |
| --- | --- | --- | --- | --- |
| [Mermaid diagrams](mermaid-diagrams.md) | Edit diagram source with a live, offline preview | Medium | Open | Unassigned |

Effort is a rough size estimate, not a deadline. Read each brief's technical fit
before committing; SDK investigation can change the estimate.

## Take on a request

1. Read the brief and check its linked discussion and implementation work.
2. [Open an issue](https://github.com/LunarisApp/extensions/issues/new) linking the
   brief. Describe your approach, intended scope, and any SDK questions. Use the
   same issue to discuss or claim the request.
3. Wait for a maintainer to confirm ownership before starting substantial work.
   Then open a PR updating the brief's contributor and discussion links and setting
   both the brief and this index to **In progress**.
4. Start with the [extension creator](../create-extension/README.md) and
   [extension quickstart](https://docs.lunaris.app/developers/extensions/quickstart).
   Build and test against the current public SDK; raise blockers in the issue.
5. Link your implementation PR in the brief. Follow the repository's
   [publishing guidance](../README.md#publishing-official-extensions) when preparing
   an official extension release.
6. Once the implementation is merged, update the brief and index to
   **Implemented** and link the merged implementation. If work stops, coordinate
   with the maintainer and return the request to **Open**.

Status definitions:

- **Open**: available for a contributor; no confirmed owner.
- **In progress**: maintainer-confirmed contributor is working on it.
- **Implemented**: implementation merged; brief links the completed work.

Tracking lives in Markdown and linked GitHub issues/PRs. Requests are not
installable extensions and do not belong in `marketplace.json`.

## Propose another extension

Copy [TEMPLATE.md](TEMPLATE.md) to `requests/<extension-slug>.md`, fill it in, and
add a row above. Submit both changes in a PR. Keep briefs in English, use
**resource** and **resource view** for Lunaris content, and distinguish verified
SDK support from capabilities that need investigation.

Prefer one useful workflow with a small first release. Include a concrete user
example, exclusions, and acceptance criteria a reviewer can verify.
