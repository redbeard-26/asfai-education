---
name: education-lesson-authoring
description: Create and review ASFAI lessons with aligned learning objectives, artifacts, dynamic facilitation instructions, assessment methods, and lesson-report rules through the ASFAI Education MCP.
---

# ASFAI lesson authoring

Help a teacher turn an idea into a versioned lesson package. The public MCP supplies objective discovery, validation, review, and publication preparation; it does not retain drafts or anonymously publish executable artifacts.

## Write for the learner, not the machinery

Student instructions and any suggested assistant dialogue must use ordinary language appropriate to the intended learners. They must say what will be learned or done and ask the actual question. Do not mention an "interaction," "skill," "workflow," "tool call," "MCP," "rubric," "evidence event," "assessment claim," "telemetry," scoring pipeline, or orchestration step unless the lesson explicitly teaches that technology.

Keep technical directions in the assistant or teacher fields. For example, write the student instruction as “Explain how the rectangle's side lengths relate to the factors,” not “Complete this interaction so the assistant can create evidence against the rubric.” Review every student instruction for this separation before validation.

## Begin with a scoped outline

Call `asfai_lesson` action `prepare_outline` before drafting. Use `mode:"new"` for an idea, `mode:"polish"` for a supplied draft, or `mode:"expand"` for an existing outline. Inspect any attachment first and pass only source-backed facts or inferences; include the source reference for inferred values. Treat memory as a tentative preference, not proof of course requirements. Ask the returned questions in ordinary teacher-facing language, grouping related questions where useful. Do not invent an audience or learning outcome to bypass clarification.

For a new outline, the topic, course, audience, and observable learning outcomes must be clear. A rough draft may already supply these; ask what “polish” means before changing it unless the requested edit is explicit. Formatting-only edits do not require a full pedagogical intake. For gap analysis or objective mapping, confirm the intended learners and outcomes. Preserve the original and show substantive changes separately from cosmetic ones.

Draft a versioned `lesson-outline` artifact, then call `asfai_lesson` action `validate_outline`. Review it with the teacher before expanding it into the existing full lesson definition. The outline is not a published lesson or an evaluation.

## Begin the full plan with evidence

Call `asfai_lesson` action `prepare_authoring` with the teacher's idea, audience, constraints, and teaching modes. Ask only for missing choices that materially affect the lesson.

Use the learning-objective tools to find appropriate public objectives. When the public graph has no sufficiently specific objective, create a scoped ASFAI objective identifier and record sourced external alignments rather than copying taxonomy records.

Search can accept a natural phrase, but inspect the returned objectives and retry with shorter or alternate terms if the matches are weak. Do not cite a standard as graph-grounded merely because the code sounds relevant. For each cited standard, call `asfai_graph` action `verify_standard_alignment` with its objective ID and code, then retain that ID and the verified fully qualified code in the lesson's source references. If verification fails, label it a proposed external alignment for teacher review rather than a graph result. An old plan without objective IDs cannot be retroactively certified as graph-grounded.

For every objective, establish:

- what the learner will do or create;
- what observation would support the objective;
- what would remain ambiguous or confounded;
- how assistance changes the interpretation; and
- what additional modality would demonstrate reasoning or transfer.

Read [references/lesson-package.md](references/lesson-package.md) while constructing the package.

## Design activities and assessment

Activities can be self-guided, teacher-led, collaborative, or hybrid. Give distinct instructions to the learner, assistant, and teacher. Select assessment methods based on the actual evidence modality, using [references/assessment-methods.md](references/assessment-methods.md).

Student instructions must remain usable when delivered verbatim by a chat assistant. Assistant instructions may describe internal orchestration but must explicitly tell the host to translate them into natural teaching, questions, and feedback rather than narrating them.

Do not use completion as proficiency. Do not let a group product establish an individual's mastery without individual evidence. A learner reflection is evidence of reflection, not independent proof of the underlying objective.

For AI-created or uploaded artifacts, retain provenance and licensing, provide an accessible fallback, and identify a versioned evidence adapter. Never place student data, access credentials, private assessment material, or proprietary content in the public lesson package.

## Review and prepare publication

Call `asfai_lesson` action `validate`, correct every error, then call action `review`. Discuss material warnings with the teacher. Preserve pilot or unvalidated assessment thresholds as explicit policy metadata and keep consequential assessment disabled until reviewed and calibrated.

Call `asfai_lesson` action `prepare_publication` only after the teacher confirms the final package. This produces a digest and immutable object keys; it does not perform the authenticated publication. Never tell the teacher that a lesson or artifact is hosted until the authenticated publisher confirms it.

After publication, call `asfai_lesson` action `create_assignment` when the teacher wants to distribute the lesson. Record the returned assignment through `asfai_resource`, save it by following the storage resource for the user's store (`asfai-storage-pod`, `asfai-storage-drive`, or `asfai-storage-local`, from `asfai_capability` action `get_skill`), and share only the intended assignment fields.
