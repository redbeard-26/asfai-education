# Educator artifact workflows (prototype)

The Education MCP keeps its nine default tools. It adds actions to existing gateways:

| Primitive | Intake | Validation | Persisted artifact |
| --- | --- | --- | --- |
| Lesson | `asfai_lesson.prepare_outline` | `asfai_lesson.validate_outline`, then existing `validate`/`review` for a full plan | `lesson-outline` followed by the existing `lessonDefinition` |
| Evaluation | `asfai_evidence.design_evaluation` | `asfai_evidence.validate_evaluation` | `evaluation`, linked to a complete lesson plan |
| Transform | `asfai_resource.prepare_transform` | `asfai_resource.validate_transform` | `transform`, linked to an existing source and a distinct output |

The chat host reads attachments and creates prose, slides, audio scripts, or other output using capabilities it actually has. The MCP returns missing-information questions and validates the resulting typed records; it does not pretend to render a file or retain a draft. Private teacher artifacts can be versioned through `asfai_resource` and saved to the teacher's Solid Pod with `asfai_storage`, or to the teacher's Google Drive with the assistant's own Drive connector. A save is complete only after read-back verification.

## Provisional state graph

```
Lesson:     clarifying → ready_to_draft → outline draft → outline reviewed → full plan draft → full plan reviewed → publication preparation
Evaluation: complete lesson plan → clarifying → ready_to_draft → evaluation draft → evaluation reviewed → optional assignment publication
Transform:  source asset → clarifying → ready_to_draft → output draft → output reviewed → optional sharing
```

The intake states are returned by the preparation actions. The versioned artifacts use `draft` and `reviewed`; the existing full lesson package retains its own `draft`, `published`, and `retired` statuses. Each artifact records source references and a small decision trace distinguishing teacher answers, source-backed facts, and assistant suggestions. This is an audit aid, not a server-side history database. A committee can revise transitions, required fields, and review authority before a stable schema version is declared.

## Design choices for review

- This repository is TypeScript, so the prototype uses Zod rather than adding a Python/Pydantic service. The objects are JSON-compatible and can be mirrored in Pydantic later.
- An outline is deliberately lighter than the existing complete lesson schema. Formatting-only polish needs the source and intended edit; pedagogical gap or graph-mapping work also needs audience and outcomes.
- Evaluation requires a complete plan with activities and outcomes, a stated purpose, and a per-student teacher review-time budget. The validator rejects unassessed outcomes, missing criteria, unknown mappings, and plans exceeding that budget. If no special resources are specified, the assistant should design for ordinary paper/chat materials.
- Transform is independent of lesson and evaluation. It requires an existing source, explicit operation and target representation, preserves source provenance, and rejects an output reference that overwrites the source.
- TypeSafe AI's Jev could later classify ambiguity, select the next question, or score readiness, but it is not required for this release. It returns typed decisions rather than generated lesson content, and its early-access dependency should be evaluated separately with teacher examples and human review.
