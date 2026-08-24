# Accountless learner storage and Education MCP

ASFAI Education does not require an ASFAI learner account.

## Storage boundary

Learner progress is private, user-controlled state. The initial implementation supports two interchangeable browser stores behind the `LearnerStore` interface, plus a host-local JSON option for MCP chat clients:

1. **IndexedDB** — default, zero-setup persistence in the current browser profile.
2. **Solid Pod** — portable cloud persistence using Solid OIDC. PrivateDataPod is the first tested provider, but the implementation uses Solid standards rather than provider-specific APIs.
3. **Local JSON** — a host-approved `asfai/learner.json` file when the AI chat environment has persistent filesystem access.

The learner profile retains a pseudonymous learner UUID, evidence events, assessment claims, derived learner-objective states, lesson runs, and lesson reports. Moving a profile from IndexedDB to a Pod preserves the same learner UUID. Schema `0.2` migrates existing `0.1` profiles in place.

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

The Education MCP server is intentionally stateless with respect to durable learner identity. It hosts public graph operations, conversational assessment, lesson orchestration, evidence transformation, reporting, progress-envelope validation, and skill installation.

For MCP clients that can run a local companion process, `npm run personal-storage:mcp` exposes exactly one additional tool, `asfai_personal_storage`. It performs Solid OIDC through a loopback browser callback, retains the resulting access material only inside the local process, and performs authenticated Pod reads/writes. It also provides verified atomic local JSON storage and owner-controlled Ed25519 signatures for classroom exchange. This companion is deliberately not deployed as part of the public AWS MCP: putting user tokens in the shared server would violate the learner-owned storage boundary.

The companion uses these stable documents:

```text
<POD_ROOT>/asfai/learner.json
<POD_ROOT>/asfai/educator.json
<POD_ROOT>/asfai/classroom.json
```

The temporary AWS Education page can complete browser Solid OIDC even before a custom education domain exists. The custom domain is an alias, not a storage or MCP prerequisite.

Public graph actions use `asfai_graph`:

- `list_programs`
- `search_objectives`
- `get_objective`
- `get_neighbors`
- `get_program_objectives`
- `get_frontier`
- `find_path`

When personalized graph calculations are needed, the client reads its own learner store and sends only the required objective IDs (for example, `masteredIds`) to the MCP tool. The MCP server neither signs the learner into ASFAI nor writes learner records to an ASFAI database. Tools that change a profile return the complete updated JSON and tell the host to save it through browser IndexedDB, a local file, or the learner's authenticated Solid fetch.

`asfai_storage` action `instructions` returns the exact write and read-back procedure for learner or educator state. The AI host must first confirm that it actually has one of these capabilities:

- browser JavaScript executing on the ASFAI Education origin for IndexedDB;
- a persistent filesystem writer for local JSON; or
- a logged-in Solid session with authenticated fetch for a Pod.

IndexedDB is origin-bound, and a WebID by itself is not an authenticated Solid session. A generic remote MCP client with neither browser execution, filesystem access, nor authenticated Solid fetch cannot persist the profile. It must return downloadable JSON and say saving is pending. After writing, the host rereads the complete object and calls `asfai_storage` action `verify`; it may say progress is saved only when `verified` is true.

Hosted game launches use an optional one-hour pseudonymous result relay. The relay receives a minimized game summary, not the learner profile, and deletes the result after one successful claim. Its process-local pilot implementation is not a durable learner-record store.

This boundary allows an AI assistant to reason over the public graph while keeping durable learner data in IndexedDB or a user-owned Pod.

See [Lessons and artifacts](LESSONS-AND-ARTIFACTS.md) and [Lesson progress exchange](PROGRESS-EXCHANGE.md).

## Learning programs

The initial Marble taxonomy does not define ASFAI-specific named programs. The first implementation therefore treats a **subject**, optionally narrowed to a **domain**, as a program scope. The MCP schema is designed so explicit ASFAI program definitions can later map to curated objective sets without changing learner storage.

## Public graph source

The first runtime fetches the Marble Open Skill Taxonomy from its upstream public GitHub repository and caches it in the Next.js server runtime. This keeps the education service self-contained while avoiding duplicate learner-state infrastructure. Attribution and share-alike obligations described elsewhere in this repository continue to apply.
