# Capability catalog and compact MCP

ASFAI exposes a versioned catalog of 172 capabilities: 33 platform capabilities (`P01`–`P33`), 88 educator capabilities (`T01`–`T88`), and 51 student capabilities (`S01`–`S51`). Named educational features are catalog data rather than separate always-loaded tools.

Each definition includes an immutable ID and version, audience, category, purpose, risk, mode, exact input and output JSON Schemas, evaluator set, host guidance, access level, required scopes, state owner, side-effect and confirmation policy, supported representations, external handoffs, and a non-web fallback. The catalog digest changes whenever any definition changes.

## Default surface and context budget

| Gateway | Actions |
|---|---|
| `asfai_capability` | manifest, list, search, get, recommend, custom-capability validation/publication preparation, list/get/install skills |
| `asfai_graph` | programs, objective search/get/neighbors, program objectives, frontier, path |
| `asfai_run` | prepare a one-shot, async, or control-plane capability run |
| `asfai_session` | start/resume/continue/finish learner dialogue; join rooms; start/answer/finish quizzes |
| `asfai_lesson` | author/search/get/validate/review/publish/assign/run/step/artifact relay |
| `asfai_evidence` | assessment, learner/lesson evidence, summary, report, progress export/import |
| `asfai_resource` | resources, immutable versions, collections, sharing, rooms, quizzes, workflows, jobs, export |
| `asfai_storage` | initialize, instructions, export, and read-back verification |

CI requires exactly eight default tools and no more than 6,000 serialized characters for names, titles, descriptions, and input schemas. Private profile and lesson schemas are therefore validated after routing rather than expanded in `tools/list`.

## MCP-first execution

`asfai_capability` selects a definition. `asfai_run` returns its versioned instructions, required review, output contract, and persistence owner; the connected AI host produces the requested draft. Interactive student features use `asfai_session`, whose complete state is returned after every turn. The host can stop, save, and resume without an ASFAI webpage.

Asynchronous media or export work uses caller-owned job checkpoints through `asfai_resource`. Starting a job does not claim that the public server queued provider work. The authorized host performs the work, updates the checkpoint, supplies provenance and an accessible representation, and can cancel or resume it.

Multi-step work uses a versioned dependency graph and caller-owned checkpoint. Steps become ready only after dependencies finish, approval steps preview before execution, completed steps are idempotent on replay, and a checkpoint can be canceled or resumed without a browser tab.

Educator resources are portable immutable versions. Editing produces a new resource ID with a parent link. Publishing, sharing, revocation, room publication/closure, and quiz publication/retirement use preview and explicit confirmation. The complete updated workspace is saved by the caller.

Student rooms are versioned teacher-owned definitions with approved capabilities, sources, objectives, age/locale, access, visibility, and trusted-adult policy. Joining creates a pseudonymous learner-owned membership. Raw conversations are never retained by the public MCP and are excluded from teacher visibility by schema.

Quizzes keep answer keys in the teacher-owned definition and omit them from learner items. Deterministic multiple-choice feedback and open-response criteria produce provisional observations only. `asfai_evidence` performs any justified evidence/claim transition, preserving assistance and limitations.

## Trust and storage boundaries

- Public graph and capability metadata may be cached by the service.
- Learner profiles, learning sessions, room memberships, attempts, and reports belong to the learner store.
- Educator workspaces, room/quiz definitions, assignments, and private resources belong to the educator store.
- District configuration, audit, Knowledge, moderation, analytics, and integration state require a separately authenticated tenant boundary.
- Restricted workflows produce drafts for qualified human review and never make diagnosis, eligibility, placement, discipline, employment, grading, service, or crisis decisions.

`asfai_storage` supports browser IndexedDB, a host-local JSON file, and a learner or educator Solid Pod. The public MCP never receives passwords, tokens, DPoP keys, or cookies. A write is successful only after an independent read-back produces the same digest.

OAuth, viewing media, playing a visual game, physical performance, and human signatures may require an external handoff. The MCP initiates or describes the handoff, preserves continuation state, and provides a text/structured fallback. No workflow requires the ASFAI website as coordinator.

## Compatibility mapping

The former 28 tool names are no longer exposed in `tools/list`; their domain logic remains behind gateway actions. Existing clients should use the mappings below.

| Former family | Gateway |
|---|---|
| learning program/objective/frontier/path tools | `asfai_graph` |
| assessment preparation, evidence, profile summary | `asfai_evidence` |
| lesson authoring, catalog, assignment, run and artifacts | `asfai_lesson` |
| lesson evidence, reports and progress envelopes | `asfai_evidence` |
| learner storage instructions | `asfai_storage` |
| skill listing and installation | `asfai_capability` |

The upstream Marble GitHub fetch and runtime cache remain unchanged. No Marble taxonomy files are copied into this capability catalog or deployment.
