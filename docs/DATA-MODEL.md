# Core Data Model

The data model separates curricular meaning, observed evidence, assessment judgments, and derived learner state. This separation makes AI-assisted decisions reviewable and lets the underlying graph evolve without rewriting history.

## Core entities

| Entity | Purpose |
|---|---|
| `CompetencyFramework` | A versioned collection issued by an organization or jurisdiction |
| `LearningObjective` | A stable, assessable statement of knowledge, skill, or practice |
| `ObjectiveRelationship` | A typed, directed edge between objectives |
| `Rubric` | A versioned scoring instrument associated with one or more objectives |
| `RubricCriterion` | A dimension of performance described by a rubric |
| `PerformanceLevel` | An ordered level with observable descriptors |
| `Course` | An organized learning offering |
| `LessonDefinition` | A public, immutable plan connecting objectives, activities, artifacts, assessment methods, and report rules |
| `LessonAssignment` | Teacher-owned configuration and sharing policy for one lesson version |
| `LessonRun` | Learner-owned state for one attempt through a lesson |
| `LessonReport` | A lesson-scoped projection of linked evidence and claims |
| `ProgressEnvelope` | A consent-scoped message exchanged between learner and teacher roles |
| `Activity` | A game, assignment, lesson, project, or observation opportunity |
| `ActivityObjectiveAlignment` | A sourced claim that an activity teaches or elicits an objective |
| `EvidenceEvent` | An immutable observation of learner activity |
| `Artifact` | A durable product such as code, media, a document, or a device result |
| `AssessmentClaim` | A human or machine judgment connecting evidence to a rubric criterion |
| `LearnerObjectiveState` | A derived snapshot of progress for a learner and objective |
| `Enrollment` | Institutional context connecting a learner, course, and role |
| `Credential` | A portable, validated representation of an accomplishment |

## Relationship vocabulary

Initial objective edges should include:

- `isChildOf`: framework hierarchy;
- `isPartOf`: compositional relationship;
- `prerequisiteOf`: a genuine dependency;
- `precedes`: a recommended instructional order;
- `exactMatch`, `closeMatch`, `broaderThan`, `narrowerThan`, `relatedTo`: cross-framework alignments;
- `supports`: useful but non-required background;
- `assessedBy`: link to a rubric or assessment definition.

Edges have their own identifiers, issuer, evidence or rationale, confidence, effective dates, and version status. This permits contested alignments to coexist without pretending they are objective facts.

## Evidence event

An internal event can be serialized to xAPI where appropriate, but the internal model also preserves application-specific payloads and privacy controls.

```json
{
  "id": "urn:uuid:4e9bc2f1-80bc-4d71-bd57-8356d92f0384",
  "learnerId": "urn:asfai:learner:pseudonymous:7db2",
  "activityId": "urn:asfai:activity:algebra-balance-01",
  "verb": "answer-submitted",
  "occurredAt": "2026-08-19T18:32:14Z",
  "attemptId": "urn:uuid:db24c235-9bd7-4fb0-a884-92879518573e",
  "objectiveAlignments": [
    {
      "objectiveId": "urn:asfai:objective:preserve-equality",
      "alignmentType": "elicits"
    }
  ],
  "result": {
    "success": true,
    "response": "x = 7",
    "duration": "PT42S"
  },
  "assistance": {
    "hintsRequested": 1,
    "solutionShown": false
  },
  "source": {
    "system": "block-algebra-drop",
    "version": "0.1.0"
  }
}
```

The example uses a pseudonymous learner identifier. Production payloads should avoid copying raw conversations or unnecessary personal data into the evidence ledger.

### Evidence artifacts and inline transcripts

The portable learner profile keeps learner-owned artifacts in a top-level `artifacts` map. Evidence events link them through `artifactIds`, so one submission can support several objective-specific observations without duplicating its transcript. The original file may remain in a classroom provider or another owner-controlled store.

Inline transcript text is limited to **8 KiB of UTF-8 text per artifact**. This is large enough for short answers and several pages of ordinary prose while keeping `learner.json` compact. For larger text or any binary file, retain the provider/object reference and digest, store at most a 2,000-character summary inline, and keep the original outside `learner.json`. Do not base64-encode images, audio, video, or documents into the learner profile.

An artifact records its type, media type, byte length and SHA-256 digest when available, provider-neutral provenance, and an optional transcript. A transcript identifies how it was produced, whether it has been reviewed, confidence when applicable, and whether it is complete. AI transcription of obscured handwriting should remain `unreviewed` and `complete:false` until a person confirms it.

## Assessment claim

An assessment claim interprets one or more evidence records under a rubric.

```json
{
  "id": "urn:uuid:6da498f1-7868-48f6-bb6b-7e18ec67bf64",
  "learnerId": "urn:asfai:learner:pseudonymous:7db2",
  "objectiveId": "urn:asfai:objective:preserve-equality",
  "rubricId": "urn:asfai:rubric:algebra-transformations:v2",
  "criterionId": "valid-transformation",
  "level": "proficient",
  "evidenceIds": [
    "urn:uuid:4e9bc2f1-80bc-4d71-bd57-8356d92f0384"
  ],
  "assessor": {
    "type": "ai",
    "system": "asfai-assessor",
    "version": "0.3.0"
  },
  "confidence": 0.78,
  "rationale": "The transformation preserved equality and the final solution was correct; one hint reduced the independence rating.",
  "createdAt": "2026-08-19T18:33:03Z",
  "supersedes": null
}
```

The assessor's prompt, model configuration, deterministic checks, rubric version, and relevant policy version should be retained in an access-controlled audit record when AI is used.

## Learner-objective state

The first implementation can use understandable ordinal states:

```text
not_observed → emerging → developing → proficient → mastered
```

A state record should also expose:

- confidence or uncertainty;
- total and independent evidence counts;
- breadth of tasks and contexts;
- recency and retention checks;
- assistance level;
- contradictory evidence;
- the aggregation policy version;
- the objective and framework version;
- the claim identifiers supporting the state.

“Mastered” is never permanent by definition. A policy may require multiple independent demonstrations, minimum rubric levels across essential criteria, task diversity, and a later retention check. Different programs may define different thresholds while sharing the same underlying claims.

## Provenance and versioning

Imported standards must retain source URL, issuer, official identifier, jurisdiction, language, edition, effective date, retrieved date, checksum, and license. Never overwrite one edition with another. Retire or supersede old nodes and publish explicit mappings to replacements.

The same rule applies to interpretations. Correcting a score creates a superseding claim; changing a mastery formula creates a new calculation version. This allows a learner state to be reconstructed as it appeared at a given time.
