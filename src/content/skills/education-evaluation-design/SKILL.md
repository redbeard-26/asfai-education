---
name: education-evaluation-design
description: Design a feasible, outcome-aligned student evaluation from an existing ASFAI lesson plan or teacher-supplied plan, with structured clarification and review.
---

# Design an evaluation from a lesson

First inspect the completed lesson plan and any prior assignments the teacher supplies. Call `asfai_evidence` action `design_evaluation` with `lessonPlan` containing its stable reference, title, stage (`complete` or `outline`), and activity summary, plus its audience, explicit learning outcomes, intended purpose, teacher review-time budget, and any available resources. Pass source-backed inferences with their source reference. If the plan is only an outline, ask to complete the lesson plan before designing a final evaluation. Ask the returned questions before drafting; do not silently invent learners, outcomes, time, equipment, or grading stakes.

Separate this design from lesson planning. Propose one or two modalities that would actually elicit the intended learning—writing, problems, conversation, performance, project, collaboration, or a mix—and explain their workload and limitations. Let the teacher choose or ask for a recommendation. A group product alone does not prove an individual's understanding. An AI-assisted product requires process evidence or an independent explanation when independent learning is the aim.

Create a versioned `evaluation` artifact with tasks, an outcome ID for each task, observable evidence, criteria, an AI-use policy, an accessibility alternative, and estimated student and teacher time. Keep answer keys and private assessor guidance separate from student directions. Call `asfai_evidence` action `validate_evaluation`; correct unassessed outcomes, missing criteria, and plans exceeding the teacher's time budget. Present the draft for teacher review. Do not publish an assignment or grade learners without explicit approval.

If the teacher wants to keep it, use `asfai_resource` to create or version an educator-owned resource containing the validated artifact, then `asfai_storage` to save the complete educator document and read it back. Only say it is saved after verification. The MCP server does not retain the draft.
