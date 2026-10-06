# Accountless learner storage and Education MCP

ASFAI Education does not require an ASFAI learner account.

## Storage boundary

Learner progress is private, user-controlled state. The web app reads and writes it through a common `LearnerStore` interface, and chat assistants save it in a store the user owns. How each kind of store saves is described only in the storage resources listed in [Private storage](PERSONAL-STORAGE-COMPANION.md).

The learner profile retains a pseudonymous learner UUID, evidence events, learner-owned artifact metadata and short transcripts, assessment claims, derived learner-objective states, lesson runs, and lesson reports. Moving a profile between stores preserves the same learner UUID. Schema `0.2` migrates existing `0.1` profiles in place. Inline artifact transcripts are capped at 8 KiB of UTF-8 text; larger or binary artifacts stay in their owner-controlled source and are referenced from the profile.

The logical evidence and assessment collections remain append-oriented even though this first implementation serializes the portable snapshot into one JSON resource. A later implementation may project those collections into separate immutable resources without changing the `LearnerStore` contract.

Do not put client secrets, passwords, access tokens, or session cookies in this repository.

## MCP boundary

The Education MCP server does not require an ASFAI user account. It hosts public graph operations, conversational assessment, lesson orchestration, evidence transformation, reporting, progress-envelope validation, skill installation, and an authenticated tenant boundary for private provider connections.

The **ASFAI Learning** plugin contains exactly one remote MCP connector. OAuth 2.1 with PKCE creates a pseudonymous connector tenant; an email address or ASFAI login is not required. The same connection exposes nine compact tools, including `asfai_storage` and the provider-neutral `asfai_classroom`. Provider authorization is completed on the provider's hosted page. Reusable provider grants are encrypted with AES-256-GCM and isolated by connector tenant; they never appear in tool arguments or model-visible output.

`asfai_storage` provides private storage actions, the location of each record in the user's store, and read-back checks. Every result that must be saved carries a pointer to the storage resource that describes how. Without a store, the host keeps the portable result and reports that saving is pending; ASFAI does not create a fallback education record. Saved provider authorization persists until the user explicitly forgets it, revokes the provider grant, or revokes the ASFAI connector. Closing a chat or browser is not a disconnect event.

Public graph actions use `asfai_graph`:

- `list_programs`
- `search_objectives`
- `get_objective`
- `get_neighbors`
- `get_program_objectives`
- `get_frontier`
- `find_path`

When personalized graph calculations are needed, the client reads its own learner store and sends only the required objective IDs (for example, `masteredIds`) to the graph action. Tools that change a profile return the complete updated JSON; the host saves it by following the storage resource for the user's store and says it is saved only after that resource's read-back check succeeds.

Hosted game launches use an optional one-hour pseudonymous result relay. The relay receives a minimized game summary, not the learner profile, and deletes the result after one successful claim. Its process-local pilot implementation is not a durable learner-record store.

This boundary allows an AI assistant to reason over the public graph while keeping durable learner data in storage the user owns.

See [Lessons and artifacts](LESSONS-AND-ARTIFACTS.md) and [Lesson progress exchange](PROGRESS-EXCHANGE.md).

## Learning programs

The initial Marble taxonomy does not define ASFAI-specific named programs. The first implementation therefore treats a **subject**, optionally narrowed to a **domain**, as a program scope. The MCP schema is designed so explicit ASFAI program definitions can later map to curated objective sets without changing learner storage.

## Public graph source

The first runtime fetches the Marble Open Skill Taxonomy from its upstream public GitHub repository and caches it in the Next.js server runtime. This keeps the education service self-contained while avoiding duplicate learner-state infrastructure. Attribution and share-alike obligations described elsewhere in this repository continue to apply.
