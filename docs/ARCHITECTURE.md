# Architecture

## Objective

ASFAI Education should connect many learning experiences to one explainable view of student progress. A game, AI tutor, classroom course, and community technology project can emit very different evidence while referring to the same learning objectives.

The architecture therefore separates six concerns that are often collapsed into a single grade or progress percentage.

## System layers

### MCP access boundary

The installed ASFAI Learning plugin contains one authenticated remote MCP connector. OAuth 2.1 with PKCE establishes a pseudonymous, accountless connector tenant. Nine compact gateway tools serve public learning operations, private Pod-first storage, and provider-neutral classroom exchange without requiring a coordinating website or local runtime.

Solid and classroom OAuth grants are encrypted and isolated by connector tenant. A connected Solid Pod is the primary learner and educator store. When no Pod is available, the gateway uses a clearly identified tenant-scoped AWS fallback rather than pretending that model output has been persisted. Classroom systems transport assignments, documents, submissions, and approved evaluations; they do not become the source of truth for mastery.

### 1. Competency graph

The graph defines learning objectives and the relationships among them. It contains:

- stable identifiers and human-readable statements;
- framework, subject, grade-band, jurisdiction, and version metadata;
- structural relationships such as `isChildOf` and `isPartOf`;
- dependency relationships such as `prerequisiteOf`;
- alignments such as `exactMatch`, `closeMatch`, `broaderThan`, and `narrowerThan`;
- rubrics, criteria, and performance levels.

The graph distinguishes an instructional sequence from a true prerequisite. “Usually taught before” is not automatically “required to understand.”

### 2. Courses, activities, and resources

Courses organize activities. Each activity or resource declares the objectives it is designed to teach or elicit, with an alignment type and optional weight. Alignment is a claim with provenance, not an intrinsic property of the resource.

### 3. Adapters and telemetry

Adapters translate product-specific actions into a shared evidence vocabulary. They may receive events through xAPI, an application API, an LMS integration, or a batch import.

Telemetry should preserve the original event and identify the actor, activity, objective alignment, time, attempt, context, source system, and software version. An event records what occurred; it does not by itself prove mastery.

### 4. Evidence ledger

The ledger is an append-oriented record of events, submitted artifacts, observations, and assessment results. Corrections should supersede earlier records rather than silently rewrite history. Sensitive identity data should be held separately from learning evidence and joined through pseudonymous identifiers.

### 5. Assessment service

An instructor, deterministic scorer, peer reviewer, or AI assessor evaluates evidence against a stated rubric and emits an assessment claim. Every claim includes:

- the evidence evaluated;
- the objective and criterion;
- the rubric and version;
- the asserted level or score;
- the assessor type and version;
- confidence and a concise rationale;
- timestamps and supersession status.

The learning assistant and assessor should be separable roles. A tutor that supplied a solution should not silently treat the resulting answer as independent evidence.

### 6. Mastery engine and learner profile

The mastery engine aggregates claims into a learner-objective state. Its rules must be inspectable and versioned. A state includes its level, confidence, supporting evidence count, independent evidence count, last observation, and the versions of the objective, rubric, and aggregation policy.

Portable accomplishments can be published separately through formats such as Comprehensive Learner Record or Open Badges. A portable credential is a projection of the internal evidence history, not a replacement for it.

## Example: algebra game

An interactive algebra game might align actions to objectives such as:

- preserve equality while transforming an equation;
- choose and apply inverse operations;
- simplify expressions accurately;
- explain why a transformation is valid.

Useful events include `problem-presented`, `move-made`, `hint-requested`, `answer-submitted`, `explanation-submitted`, and `attempt-completed`. The adapter retains the sequence of moves and assistance level. A scorer can then apply a rubric that distinguishes a correct independent solution from one completed after repeated hints.

A single correct move is evidence, not mastery. A stronger mastery policy might require successful, substantially independent performance across several non-identical problems and more than one session.

## Example: project-based technology learning

Programs such as [Compudopt's technology programs](https://www.compudopt.org/tech-programs) include coding, digital literacy, hardware, networking, cybersecurity, AI, and other project-based experiences. Evidence may include:

- project artifacts and version history;
- milestone completions;
- demonstrations or presentations;
- mentor observations;
- student explanations and reflections;
- automated tests or device telemetry.

An activity can target technical objectives and durable practices at once. For example, a small connected-device project might provide evidence about programming logic, circuit construction, debugging, documentation, and responsible data handling. Each claim should point to the specific artifact or observation that supports it.

## Recommended first implementation

A graph database is not required for the first release. A relational store can hold versioned objectives and edges, while an append-only event table and object storage hold evidence and artifacts. Graph projections or a dedicated graph database can be added when traversal, inference, and alignment workloads justify them.

An initial service boundary could be:

```text
Competency service       versioned frameworks, objectives, edges, rubrics
Activity service         courses, activities, resources, alignments
Evidence service         events, artifacts, provenance, supersession
Assessment service       human/machine claims against rubric criteria
Mastery service          aggregation policies and learner-objective state
Integration gateway      xAPI, CASE, QTI, LTI, OneRoster, CLR adapters
```

## Privacy and governance

The system should use data minimization, role-based access, clear retention periods, auditable access, and educator review for consequential decisions. AI judgments must expose evidence and uncertainty and support correction or appeal. Student identity, raw conversational data, and durable learner records should not share an unrestricted storage boundary.

For U.S. deployments, design and contracts should be reviewed against FERPA and applicable state student-privacy laws. The U.S. Department of Education provides current [privacy and education technology guidance](https://studentprivacy.ed.gov/privacy-and-education-technology). This document is technical guidance, not legal advice.
