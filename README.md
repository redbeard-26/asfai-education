# ASFAI Education

Open, standards-based architecture and reference implementation for AI-mediated learning, evidence, and mastery.

> **Status:** Early implementation. The repository now contains a deployable Next.js education service and MCP server, but it is not yet a production learner-record system or assessment engine.

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

The education MCP server is also in this repository. It contains **education graph tools only** and does not persist learner identity or progress. It can:

- list learning programs;
- search and retrieve objectives;
- identify prerequisite and downstream neighboring objectives;
- return objectives within a subject/domain learning program;
- compute a learner's current frontier from client-supplied mastered objective IDs; and
- find a prerequisite path to a target objective.

See [Accountless learner storage and Education MCP](docs/STORAGE-AND-MCP.md).

## Deployment

The Next.js app uses `/education` as its base path so it can be independently deployed and presented through the main ASFAI site as:

```text
https://constitution.asfai.org/education
```

The `asfai-constitution` project rewrites `/education/*` to the separately deployed education origin. Set `EDUCATION_ORIGIN` in that Vercel project to the origin of this project's Vercel deployment.

The MCP endpoint is:

```text
/education/api/mcp
```

For local development:

```bash
npm install
npm run dev
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
