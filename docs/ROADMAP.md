# Roadmap

The first goal is not to ingest every available standard. It is to prove that evidence from two very different learning experiences can produce a trustworthy, inspectable view of progress against a shared objective graph.

## Phase 0 — application profile and governance

- Publish the canonical entities, identifiers, relationship vocabulary, and versioning rules.
- Define the minimum evidence-event and assessment-claim envelopes.
- Define privacy classifications, retention rules, and human-review requirements.
- Establish source, licensing, and attribution manifests for imported data.
- Choose conformance targets and pin exact versions of external specifications.

**Exit condition:** two independent implementers can serialize the same sample objectives, events, and claims without inventing incompatible fields.

## Phase 1 — narrow working pilot

- Author 10–20 observable algebra objectives with prerequisites and rubrics.
- Author 10–20 digital-project objectives spanning technical skills and practices.
- Instrument one algebra game and one Compudopt-style project workflow.
- Store immutable evidence events and versioned artifacts.
- Implement deterministic checks plus an AI assessor that produces reviewable claims.
- Implement a transparent mastery policy and educator/student progress view.
- Test correction, supersession, export, and deletion workflows.

**Exit condition:** a reviewer can open any displayed mastery state, inspect the evidence and rubric behind it, and reproduce the aggregation result.

## Phase 2 — interoperability

- Publish an xAPI profile and validation fixtures for evidence events.
- Add CASE import/export for competency frameworks and rubrics.
- Add QTI support for appropriate formal assessments.
- Add LTI 1.3 and OneRoster adapters for institutional context.
- Export validated accomplishments through CLR and Open Badges.
- Provide IEEE 1484.20.3 and IEEE 2881 mappings with documented extension points.

**Exit condition:** at least one external learning tool and one external record system exchange data without private field-level agreements.

## Phase 3 — broader curricula and validation

- Build source-specific importers for selected official frameworks.
- Add jurisdiction-aware state mappings and version transitions.
- Evaluate a reviewed Marble subset as a prerequisite-graph seed.
- Establish educator review and dispute workflows for mappings and AI claims.
- Validate scoring reliability, subgroup fairness, calibration, and accessibility.
- Add longitudinal retention and transfer-of-learning checks.

**Exit condition:** multiple programs can share canonical objectives while retaining their own curriculum sequences, standards alignments, and mastery policies.

## Measures of success

- Every mastery state is traceable to versioned claims and evidence.
- Event, assessment, and mastery semantics remain distinct.
- Framework updates do not erase prior learner history.
- AI decisions expose uncertainty and permit human correction.
- Student-facing explanations are understandable without internal system knowledge.
- Data collection is limited to a stated educational purpose.
- At least two substantively different activity types contribute valid evidence to the same learner profile.

## Explicit non-goals for the first release

- importing all 1,590 Marble topics;
- declaring blanket conformance to every referenced standard;
- using one opaque AI score as a permanent learner record;
- creating a nationwide replacement for state standards;
- storing raw student conversations indefinitely;
- treating a graph database as an architectural requirement.
