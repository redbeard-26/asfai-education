# Accountless learner storage and Education MCP

ASFAI Education does not require an ASFAI learner account.

## Storage boundary

Learner progress is private, user-controlled state. The initial implementation supports two interchangeable browser stores behind the `LearnerStore` interface, plus a host-local JSON option for MCP chat clients:

1. **IndexedDB** — default, zero-setup persistence in the current browser profile.
2. **Solid Pod** — portable cloud persistence using Solid OIDC. PrivateDataPod is the first tested provider, but the implementation uses Solid standards rather than provider-specific APIs.
3. **Local JSON** — a host-approved `asfai/learner.json` file when the AI chat environment has persistent filesystem access.

The learner profile retains a pseudonymous learner UUID, evidence events, learner-owned artifact metadata and short transcripts, assessment claims, derived learner-objective states, lesson runs, and lesson reports. Moving a profile from IndexedDB to a Pod preserves the same learner UUID. Schema `0.2` migrates existing `0.1` profiles in place. Inline artifact transcripts are capped at 8 KiB of UTF-8 text; larger or binary artifacts stay in their owner-controlled source and are referenced from the profile.

The Solid implementation stores the current portable profile at:

```text
<POD_ROOT>/asfai/learner.json
```

The browser store uses these stable IndexedDB identifiers:

```text
database: asfai-education
version: 1
object store: learner-profile
key: current
```

The logical evidence and assessment collections remain append-oriented even though this first implementation serializes the portable snapshot into one JSON resource. A later implementation may project those collections into separate immutable Pod resources without changing the `LearnerStore` contract.

## Solid authorization

The browser uses Solid OIDC through `@inrupt/solid-client-authn-browser`. The user supplies their Pod root and OIDC issuer and authenticates with the Pod provider. ASFAI does not receive or store the user's Pod password.

Do not put client secrets, passwords, access tokens, or session cookies in this repository.

## MCP boundary

The Education MCP server does not require an ASFAI user account. It hosts public graph operations, conversational assessment, lesson orchestration, evidence transformation, reporting, progress-envelope validation, skill installation, and an authenticated tenant boundary for private provider connections.

The **ASFAI Learning** plugin contains exactly one remote MCP connector. OAuth 2.1 with PKCE creates a pseudonymous connector tenant; an email address or ASFAI login is not required. The same connection exposes nine compact tools, including `asfai_storage` and the provider-neutral `asfai_classroom`. Provider authorization is completed on the provider's hosted page. Reusable Solid and Google grants are encrypted with AES-256-GCM and isolated by connector tenant; they never appear in tool arguments or model-visible output.

`asfai_storage` uses the Pod whenever a valid Solid grant is available. Without a Pod it uses a tenant-isolated AWS fallback on encrypted storage and reports the fallback explicitly. This prevents a failed save while preserving the Pod as the primary source of truth. `load` and `save` perform digest-based conflict checks and independent read-back. `identity`, `sign`, and `verify_signature` provide owner-scoped Ed25519 progress signatures without exporting a private key.

The gateway uses these stable documents:

```text
<POD_ROOT>/asfai/learner.json
<POD_ROOT>/asfai/educator.json
<POD_ROOT>/asfai/classroom.json
```

The temporary AWS origin can complete hosted Solid OIDC even before a custom education domain exists. The custom domain is an alias, not a storage or MCP prerequisite. Saved provider authorization persists until the user explicitly forgets it, revokes the provider grant, or revokes the ASFAI connector. Closing a chat or browser is not a disconnect event.

Public graph actions use `asfai_graph`:

- `list_programs`
- `search_objectives`
- `get_objective`
- `get_neighbors`
- `get_program_objectives`
- `get_frontier`
- `find_path`

When personalized graph calculations are needed, the client reads its own learner store and sends only the required objective IDs (for example, `masteredIds`) to the graph action. Tools that change a profile return the complete updated JSON and the host saves it with `asfai_storage`; the tool selects the Pod or fallback rather than requiring the model to implement Solid HTTP.

For direct web or developer clients, `asfai_storage` action `instructions` still returns the exact write and read-back procedure for learner or educator state. Such a client must first confirm that it actually has one of these capabilities:

- browser JavaScript executing on the ASFAI Education origin for IndexedDB;
- a persistent filesystem writer for local JSON; or
- a logged-in Solid session with authenticated fetch for a Pod.

IndexedDB is origin-bound, and a WebID by itself is not an authenticated Solid session. The installed plugin does not depend on these host capabilities: its authenticated remote `asfai_storage` actions perform the write. Direct clients may say progress is saved only after read-back verification succeeds.

Hosted game launches use an optional one-hour pseudonymous result relay. The relay receives a minimized game summary, not the learner profile, and deletes the result after one successful claim. Its process-local pilot implementation is not a durable learner-record store.

This boundary allows an AI assistant to reason over the public graph while keeping durable learner data in IndexedDB or a user-owned Pod.

See [Lessons and artifacts](LESSONS-AND-ARTIFACTS.md) and [Lesson progress exchange](PROGRESS-EXCHANGE.md).

## Learning programs

The initial Marble taxonomy does not define ASFAI-specific named programs. The first implementation therefore treats a **subject**, optionally narrowed to a **domain**, as a program scope. The MCP schema is designed so explicit ASFAI program definitions can later map to curated objective sets without changing learner storage.

## Public graph source

The first runtime fetches the Marble Open Skill Taxonomy from its upstream public GitHub repository and caches it in the Next.js server runtime. This keeps the education service self-contained while avoiding duplicate learner-state infrastructure. Attribution and share-alike obligations described elsewhere in this repository continue to apply.
