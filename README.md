# ASFAI Education

Open, standards-based architecture and reference implementation for AI-mediated learning, evidence, and mastery.

> **Status:** Working pilot implementation. The repository contains a deployable Next.js education service, MCP server, learner-owned evidence workflow, and a first versioned lesson. It is not a production high-stakes assessment or managed classroom-record system.

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

The education MCP server is also in this repository. It does not durably persist learner identity or progress. It can:

- list learning programs;
- search and retrieve objectives;
- identify prerequisite and downstream neighboring objectives;
- return objectives within a subject/domain learning program;
- compute a learner's current frontier from client-supplied mastered objective IDs; and
- find a prerequisite path to a target objective;
- prepare and record conversational assessments;
- install ASFAI workflow skills;
- return exact, capability-checked IndexedDB, local JSON, or Solid Pod persistence instructions;
- author, validate, review, search, and run versioned lessons;
- launch hosted artifacts through short-lived pseudonymous capabilities;
- normalize and record lesson evidence;
- generate lesson-specific reports; and
- export and verify consent-scoped teacher/student progress envelopes.

See [Accountless learner storage and Education MCP](docs/STORAGE-AND-MCP.md).

The first bundled lesson is [Block Algebra](docs/BLOCK-ALGEBRA-PILOT.md), with a guided walkthrough and a fluency game. Chat remains the primary interface; a game opens only for the activity that needs it.

## Deployment

The Next.js app uses `/education` as its base path so it can be independently deployed and presented through the main ASFAI site as:

```text
https://constitution.asfai.org/education
```

The `asfai-constitution` project rewrites `/education/*` to the separately running education service. Production is released manually to the shared ASFAI AWS host using the deployment package in `redbeard-26/asfai-constitution`; GitHub pushes do not deploy either service. The public education origin is `https://education.asfai.org`, while the constitution container reaches this service over the private Docker network.

The repository-level `Dockerfile` produces the standalone Next.js image consumed by that release. The competency graph continues to use the upstream GitHub fetch/cache implementation; taxonomy files are not copied into the deployment repository or image beyond normal application source.

The MCP endpoint is:

```text
/education/api/mcp
```

Production requires a non-secret public origin and a secret used only to sign one-hour artifact launches:

```text
NEXT_PUBLIC_SITE_ORIGIN=https://education.asfai.org
ASFAI_ARTIFACT_LAUNCH_SECRET=<at least 32 random characters>
```

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
