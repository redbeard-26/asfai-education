# Accountless learner storage and Education MCP

ASFAI Education does not require an ASFAI learner account.

## Storage boundary

Learner progress is private, user-controlled state. The initial implementation supports two interchangeable stores behind the `LearnerStore` interface:

1. **IndexedDB** — default, zero-setup persistence in the current browser profile.
2. **Solid Pod** — portable cloud persistence using Solid OIDC. PrivateDataPod is the first tested provider, but the implementation uses Solid standards rather than provider-specific APIs.

The learner profile retains a pseudonymous learner UUID, evidence events, assessment claims, and derived learner-objective states. Moving a profile from IndexedDB to a Pod preserves the same learner UUID.

The Solid implementation stores the current portable profile at:

```text
<POD_ROOT>/asfai/learner.json
```

The logical evidence and assessment collections remain append-oriented even though this first implementation serializes the portable snapshot into one JSON resource. A later implementation may project those collections into separate immutable Pod resources without changing the `LearnerStore` contract.

## Solid authorization

The browser uses Solid OIDC through `@inrupt/solid-client-authn-browser`. The user supplies their Pod root and OIDC issuer and authenticates with the Pod provider. ASFAI does not receive or store the user's Pod password.

Do not put client secrets, passwords, access tokens, or session cookies in this repository.

## MCP boundary

The Education MCP server is intentionally stateless with respect to learner identity. It hosts public graph operations only:

- `list_learning_programs`
- `search_learning_objectives`
- `get_learning_objective`
- `get_neighboring_objectives`
- `get_program_objectives`
- `get_learning_frontier`
- `find_learning_path`

When personalized graph calculations are needed, the client reads its own learner store and sends only the required objective IDs (for example, `masteredIds`) to the MCP tool. The MCP server neither signs the learner into ASFAI nor writes learner records to an ASFAI database.

This boundary allows an AI assistant to reason over the public graph while keeping durable learner data in IndexedDB or a user-owned Pod.

## Learning programs

The initial Marble taxonomy does not define ASFAI-specific named programs. The first implementation therefore treats a **subject**, optionally narrowed to a **domain**, as a program scope. The MCP schema is designed so explicit ASFAI program definitions can later map to curated objective sets without changing learner storage.

## Public graph source

The first runtime fetches the Marble Open Skill Taxonomy from its upstream public GitHub repository and caches it in the Next.js server runtime. This keeps the education service self-contained while avoiding duplicate learner-state infrastructure. Attribution and share-alike obligations described elsewhere in this repository continue to apply.
