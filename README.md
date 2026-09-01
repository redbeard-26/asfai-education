# ASFAI Education

Open, standards-based architecture and reference implementation for AI-mediated learning, evidence, and mastery.

> **Status:** MCP-first reference implementation. The repository contains a deployable Next.js education service, a compact versioned capability catalog, caller-owned educator and learner state, lessons, rooms, quizzes, evidence workflows, and hosted artifacts. Restricted and district operations remain draft/human-review workflows until an authenticated institutional control plane is configured.

ASFAI Education is intended to let students learn through AI tutors, courses, games, and hands-on projects while maintaining a coherent picture of what each student has attempted, demonstrated, and mastered.

```text
Games · tutors · courses · projects
              │ evidence events
              ▼
       Evidence ledger ─────► assessment claims
              │                      │
              └──────────┬───────────┘
                         ▼
 Competency graph ─► mastery engine ─► learner profile
```

The central rule is that an AI may produce an evidence-backed **assessment claim**, but it should not directly set an unexplained `mastered = true`. Mastery is a derived, revisable state based on multiple observations, explicit rubrics, provenance, recency, and confidence.

## Current implementation

The app is deliberately **accountless**. ASFAI does not require a learner to create an ASFAI account simply to retain progress.

Learner state is accessed through a common `LearnerStore` interface with two initial implementations:

- **IndexedDB** — the zero-setup default, stored in the current browser profile.
- **Solid Pod** — portable cloud storage using Solid OIDC; PrivateDataPod is the first provider targeted for testing.

The education MCP server is also in this repository. The installed plugin connects to one authenticated remote MCP with nine compact gateways rather than one tool for each feature:

- `asfai_capability` discovers 33 platform, 88 educator, and 51 student capabilities and delivers workflow guidance;
- `asfai_graph` searches the upstream learning graph and computes neighbors, frontiers, and paths;
- `asfai_run` prepares versioned one-shot and control-plane work with validation and review contracts;
- `asfai_session` runs resumable learner dialogue, room joins, and formative quizzes with caller-owned state;
- `asfai_lesson` authors, validates, reviews, publishes, assigns, and facilitates versioned lessons and games;
- `asfai_evidence` prepares assessment, records justified observations and claims, reports, and exchanges scoped progress;
- `asfai_resource` manages immutable educator resources, collections, rooms, quizzes, sharing, publication previews, and resumable artifact jobs; and
- `asfai_storage` connects and writes a Solid Pod, manages large private course objects, and retains host-side IndexedDB/local-file procedures for direct-client compatibility; and
- `asfai_classroom` connects a named classroom provider, imports work, creates assignments and supporting documents, exports work, and returns approved evaluations.

The serialized default tool definitions are kept below 6,000 characters in CI. Exact capability schemas, policy, provenance, and workflow guidance are fetched only after selection. Public learning operations do not retain learner identity or raw work. The two private gateways use the authenticated connector tenant: `asfai_storage` writes education data only to the connected Pod, while `asfai_classroom` retains only encrypted reusable provider authorization.

The **ASFAI Learning** plugin contains one remote MCP connector and one compact routing skill. The connector authenticates through OAuth with no ASFAI account and writes private education data only to a connected Solid Pod. Without a Pod it continues without persistence or returns portable state; ASFAI does not retain a fallback education record. The same connector provides a provider-neutral classroom bridge, with Google as the first adapter. No repository clone, local runtime, website session, or manual MCP configuration is required. See [Private storage gateway](docs/PERSONAL-STORAGE-COMPANION.md), [Private course knowledge](docs/COURSE-KNOWLEDGE.md), and [Classroom connectors](docs/CLASSROOM-CONNECTORS.md).

See [Accountless learner storage and Education MCP](docs/STORAGE-AND-MCP.md).
See [Capability catalog and compact MCP](docs/CAPABILITIES-AND-MCP.md) for the complete contract and compatibility mapping.

The first bundled lesson is [Block Algebra](docs/BLOCK-ALGEBRA-PILOT.md), with a guided walkthrough and a fluency game. Chat remains the primary interface; a game opens only for the activity that needs it.

## Deployment

The Next.js app uses `/education` as its base path so it can be independently deployed and presented through the main ASFAI site as:

```text
https://constitution.asfai.org/education
```

The `asfai-constitution` project rewrites `/education/*` to the separately running education service. Production is released manually to the shared ASFAI AWS host using the deployment package in `redbeard-26/asfai-constitution`; GitHub pushes do not deploy either service. Until a custom education hostname is moved, the stack's AWS-issued `TemporaryMcpOrigin` serves both `/education` and `/education/api/mcp`. The constitution container reaches education over the private Docker network.

The repository-level `Dockerfile` produces the standalone Next.js image consumed by that release. The competency graph continues to use the upstream GitHub fetch/cache implementation; taxonomy files are not copied into the deployment repository or image beyond normal application source.

The MCP endpoint is:

```text
/education/api/mcp
```

Production requires a non-secret public origin and a secret used only to sign one-hour artifact launches:

```text
ASFAI_SITE_ORIGIN=https://<api-id>.execute-api.<region>.amazonaws.com
ASFAI_ARTIFACT_LAUNCH_SECRET=<at least 32 random characters>
```

The authenticated remote connector additionally requires `ASFAI_REMOTE_TOKEN_SECRET` and `ASFAI_REMOTE_ENCRYPTION_KEY`. Google Classroom is enabled with a Google Web OAuth client whose authorized redirect URI is `<ASFAI_SITE_ORIGIN>/education/oauth/google/callback`; its client ID and secret are supplied through `ASFAI_GOOGLE_CLASSROOM_CLIENT_ID` and `ASFAI_GOOGLE_CLASSROOM_CLIENT_SECRET`.

For local development:

```bash
npm install
npm run dev
npm test
```

Then open `http://localhost:3000/education`.

## What belongs here

- A standards-aligned competency and curriculum graph model
- The ASFAI education application
- Education-specific MCP tools
- Accountless learner-storage adapters
- Event and evidence formats for games, tutors, courses, and projects
- Rubrics and assessment-claim formats
- A transparent mastery-state model
- Import/export profiles for relevant education standards
- Guidance for integrating public standards and open taxonomies safely

No student records are committed to this repository.

## Design documents

- [Architecture](docs/ARCHITECTURE.md)
- [Existing ASFAI implementation assessment](docs/ASFAI-PRIOR-ART.md)
- [Standards profile](docs/STANDARDS.md)
- [Core data model](docs/DATA-MODEL.md)
- [Taxonomies and data sources](docs/TAXONOMY-AND-DATA-SOURCES.md)
- [Accountless storage and MCP](docs/STORAGE-AND-MCP.md)
- [Private assistant-executed course knowledge](docs/COURSE-KNOWLEDGE.md)
- [Capability catalog and compact MCP](docs/CAPABILITIES-AND-MCP.md)
- [Private storage gateway](docs/PERSONAL-STORAGE-COMPANION.md)
- [Classroom connectors](docs/CLASSROOM-CONNECTORS.md)
- [Lessons and artifacts](docs/LESSONS-AND-ARTIFACTS.md)
- [Lesson progress exchange](docs/PROGRESS-EXCHANGE.md)
- [Block Algebra pilot](docs/BLOCK-ALGEBRA-PILOT.md)
- [Licensing policy](docs/LICENSING.md)
- [Implementation roadmap](docs/ROADMAP.md)

## Standards strategy

ASFAI Education does not depend on a single standard. It uses a small application profile in which each standard has a clear job:

- IEEE 1484.20.2 and IEEE 1484.20.3 for competency definitions, frameworks, relationships, and rubrics
- 1EdTech CASE for K–12 competency-framework exchange
- IEEE 2881 and legacy IEEE 1484.12.1 concepts for learning-resource metadata
- 1EdTech QTI for portable assessment items and results
- xAPI / IEEE 9274.1.1 for learning activity and evidence events
- 1EdTech LTI and OneRoster for tool launch and institutional context
- 1EdTech CLR and Open Badges for portable achievements
- IEEE 1484.2 family guidance for learner records and privacy-aware interoperability

See [Standards](docs/STANDARDS.md) for the proposed division of responsibilities and important conformance caveats.

## Starting small

The recommended first implementation remains deliberately narrow:

1. Model a small set of algebra and project-based technology objectives.
2. Instrument one learning game and one project workflow.
3. Record immutable evidence events and artifacts.
4. Let an AI or instructor issue rubric-grounded assessment claims.
5. Calculate learner-objective state with inspectable rules.
6. Show students and educators both the current state and the supporting evidence.

## Contributing and safety

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing data or schema changes. Never commit student personally identifiable information, credentials, or third-party standards text without confirmed redistribution rights and complete provenance.

Security and student-privacy expectations are described in [SECURITY.md](SECURITY.md).

## License

Unless a file states otherwise, the original code and documentation in this repository are licensed under the [Apache License 2.0](LICENSE). That license does **not** relicense standards text, taxonomies, assessment content, or other third-party data. See [Licensing](docs/LICENSING.md) and [Third-party notices](THIRD_PARTY_NOTICES.md).
