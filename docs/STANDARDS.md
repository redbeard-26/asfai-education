# Standards Profile

No single education standard covers objectives, curriculum, assessment, activity telemetry, mastery inference, and portable learner records. ASFAI Education should use a deliberately small application profile that assigns each standard a bounded role.

## Conceptual model

```text
IEEE 1484.20.2 guidance for defining competencies
                         │
                         ▼
IEEE 1484.20.3 / CASE competency frameworks and rubrics
              │                         │
              ▼                         ▼
 IEEE 2881 learning resources      QTI assessments
 (1484.12.1 compatibility)         and other evidence
              │                         │
              └───────────┬─────────────┘
                          ▼
                  learner participation
                          │
                          ▼
              xAPI / IEEE 9274.1.1 events
                          │
                          ▼
 evidence ledger → assessment claims → mastery engine
                                             │
                                             ▼
                           learner profile / CLR / Open Badges
                           under IEEE 1484.2 practices
```

## Proposed responsibilities

| Standard or specification | Role in ASFAI Education | Important boundary |
|---|---|---|
| [IEEE 1484.20.2](https://standards.ieee.org/ieee/1484.20.2/10743/) | Guidance for writing and characterizing competencies | Guidance is not a learner-state protocol |
| [IEEE 1484.20.3](https://standards.ieee.org/ieee/1484.20.3/10749/) | Canonical concepts for competency frameworks, relationships, and rubrics | Adoption does not by itself make an implementation CASE-conformant |
| [1EdTech CASE](https://www.1edtech.org/standards/case) | Exchange of K–12 standards and competency frameworks through stable identifiers and APIs | CASE exchanges frameworks; it does not calculate mastery |
| [IEEE 2881](https://standards.ieee.org/ieee/2881/11719/) | Current learning-object metadata | Retain IEEE 1484.12.1 mappings only where legacy interoperability requires them |
| IEEE 1484.12.1 Learning Object Metadata | Compatibility with older learning-resource catalogs | It describes resources, not student progress |
| 1EdTech QTI | Portable assessment items, tests, interactions, and results | Project artifacts and open-ended observations still need a broader evidence model |
| xAPI / IEEE 9274.1.1 | Activity and evidence-event exchange | An event statement is not an assessment or mastery decision |
| 1EdTech LTI 1.3 | Secure launch and context exchange between learning platforms and tools | LTI is not the learner record |
| [OneRoster 1.2](https://standards.1edtech.org/oneroster/specifications/standards/v1p2) | Rosters, courses, enrollments, and gradebook exchange | Institutional data should remain separate from fine-grained evidence where possible |
| 1EdTech CLR and Open Badges | Portable achievements, competencies, and supporting evidence | Publish validated accomplishments, not the entire private event stream |
| [IEEE 1484.2](https://standards.ieee.org/ieee/1484.2/11164/) family | Learner-record interoperability and privacy-oriented practices | Treat it as part of the learner-record layer, not the competency graph itself |

Current IEEE Learning Technology Standards Committee work is listed on its [active standards page](https://sagroups.ieee.org/ltsc/active-standards/). The IEEE Standards Committee for Digital Education also maintains [open development resources](https://opensource.ieee.org/scd/scd).

## Application-profile rules

1. Give every framework, objective, rubric, activity, and claim a stable URI or UUID.
2. Preserve the issuer's identifier and version when importing a standard.
3. Represent prerequisite, hierarchy, sequence, equivalence, and alignment as different edge types.
4. Keep evidence events immutable and separate them from interpretations.
5. Version rubrics, assessors, and mastery policies so a decision can be reproduced.
6. Exchange only the minimum learner data required for the receiving purpose.
7. Make local extensions explicit and namespaced.

## Conformance language

The project may be *informed by* or *mapped to* a standard before it passes that standard's conformance requirements. Documentation should not call a feature “compliant,” “certified,” or “conformant” without identifying the exact version, required implementation profile, validation method, and any certification authority.

Likewise, “consistent with IEEE 1484.20.3” should mean that the internal concepts can be mapped without losing essential competency, framework, relationship, and rubric semantics. It should not imply endorsement by IEEE.
