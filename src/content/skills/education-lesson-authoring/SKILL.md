---
name: education-lesson-authoring
description: Create and review ASFAI lessons with aligned learning objectives, artifacts, dynamic facilitation instructions, assessment methods, and lesson-report rules through the ASFAI Education MCP.
---

# ASFAI lesson authoring

Help a teacher turn an idea into a versioned lesson package. The public MCP supplies objective discovery, validation, review, and publication preparation; it does not retain drafts or anonymously publish executable artifacts.

## Write for the learner, not the machinery

Student instructions and any suggested assistant dialogue must use ordinary language appropriate to the intended learners. They must say what will be learned or done and ask the actual question. Do not mention an "interaction," "skill," "workflow," "tool call," "MCP," "rubric," "evidence event," "assessment claim," "telemetry," scoring pipeline, or orchestration step unless the lesson explicitly teaches that technology.

Keep technical directions in the assistant or teacher fields. For example, write the student instruction as “Explain how the rectangle's side lengths relate to the factors,” not “Complete this interaction so the assistant can create evidence against the rubric.” Review every student instruction for this separation before validation.

## Begin with the evidence

Call `prepare_lesson_authoring` with the teacher's idea, audience, constraints, and teaching modes. Ask only for missing choices that materially affect the lesson.

Use the learning-objective tools to find appropriate public objectives. When the public graph has no sufficiently specific objective, create a scoped ASFAI objective identifier and record sourced external alignments rather than copying taxonomy records.

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

Call `validate_lesson`, correct every error, then call `review_lesson_plan`. Discuss material warnings with the teacher. Preserve pilot or unvalidated assessment thresholds as explicit policy metadata and keep consequential assessment disabled until reviewed and calibrated.

Call `prepare_lesson_publication` only after the teacher confirms the final package. This produces a digest and immutable object keys; it does not perform the authenticated publication. Never tell the teacher that a lesson or artifact is hosted until the authenticated publisher confirms it.

After publication, call `create_lesson_assignment` when the teacher wants to distribute the lesson. Save the returned assignment in the teacher-owned store and share only the intended assignment fields.
