# ASFAI Education

Open, standards-based architecture for AI-mediated learning, evidence, and mastery.

> **Status:** This repository is an early design and interoperability project. It is not yet a production learner-record system, assessment engine, or curriculum dataset.

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

## What belongs here

- A standards-aligned competency and curriculum graph model
- Event and evidence formats for games, tutors, courses, and projects
- Rubrics and assessment-claim formats
- A transparent mastery-state model
- Import/export profiles for relevant education standards
- Guidance for integrating public standards and open taxonomies safely

No student records or third-party curriculum datasets are included in this initial repository.

## Design documents

- [Architecture](docs/ARCHITECTURE.md)
- [Existing ASFAI implementation assessment](docs/ASFAI-PRIOR-ART.md)
- [Standards profile](docs/STANDARDS.md)
- [Core data model](docs/DATA-MODEL.md)
- [Taxonomies and data sources](docs/TAXONOMY-AND-DATA-SOURCES.md)
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

The recommended first implementation is deliberately narrow:

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
