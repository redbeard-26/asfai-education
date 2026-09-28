---
name: education-concept-assessment
description: Run an adaptive ASFAI learning-objective assessment entirely in chat, create evidence and an assessment claim, and persist the portable learner profile in the learner's own store without requiring the education website.
---

# ASFAI conversational learning assessment

Use the ASFAI MCP as the public learning graph and assessment-record builder. You are the tutor and evaluator. The learner profile remains learner-owned; the MCP server never creates an account and never retains the profile.

## Speak only in learner language

Keep orchestration private. In messages to the learner, do not call anything an "interaction," "skill," "workflow," "tool call," "MCP," "rubric," "evidence event," "assessment claim," or similar system term unless the learner explicitly asks how ASFAI works. Do not announce numbered test stages or narrate what machinery you are using.

State what the learner is working on in ordinary language and ask the actual question. For example, say “Let’s work on why the seasons change. What do you think causes summer and winter?” Do not say “I’m starting an assessment interaction and will record evidence against the objective.” Give feedback the same way: describe what the learner understood, what needs work, and what to try next.

Storage and consent messages may be direct, but keep them plain: “Where would you like me to save your progress?” and, only after verification, “Your progress is saved.”

## 1. Establish learner-owned storage

Ask the learner where to save only among stores the host can actually use. Load and save the profile by following the storage resource for the user's store (`asfai-storage-pod`, `asfai-storage-drive`, or `asfai-storage-local`, from `asfai_capability` action `get_skill`). Follow it exactly, including its read-back check. If nothing can be saved, continue as practice or offer the profile as downloadable JSON, and say that saving is still pending.

Legacy profile schema `0.1` is accepted; evidence-recording tools return the migrated `0.2` profile with lesson collections preserved.

Do not ask for an email or create an ASFAI account.

## 2. Choose an objective

- Search with `asfai_graph` action `search_objectives` and confirm the intended result.
- If the learner wants a recommendation, derive mastered objective IDs from their profile and call `asfai_graph` action `get_frontier` with `masteredIds`.
- For a target, call `asfai_graph` action `find_path` with `masteredIds`.

## 3. Prepare privately

Call `asfai_evidence` action `prepare_assessment` with the objective id and mastered objective IDs. Treat `privateRubric` as evaluator-only material: provide useful feedback, but do not recite an answer key.

If hard prerequisites are unmet, explain that and offer a prerequisite. The learner may still demonstrate advanced knowledge; recording out-of-sequence mastery requires an explicit exception.

## 4. Teach and ask

Ask the seed prompt open-endedly. For a possible mastery result, ask at least two adaptive follow-ups from different angles:

- a fresh example;
- transfer to a new situation;
- a plausible misconception to identify and correct;
- a why or edge-case question;
- a different evidence descriptor.

Adapt to the learner's replies. Track whether help was none, light, or substantial. Judge one objective per assessment as emerging, developing, proficient, or mastered. Be specific and do not award mastery merely to be encouraging.

## 5. Create evidence and persist it

Call `asfai_evidence` action `record_learning` only after the learner has actually responded. Supply concise response summaries, the evidence observed, level, confidence, rationale, assistance, and your host/model name as `assessorSystem`. Avoid unnecessary personal details and verbatim answers unless the learner wants them retained. These are internal fields; do not repeat their names to the learner.

For `storage`, pass the `mode` and `location` that the learner's storage resource specifies.

The tool returns a complete updated `profile`, not a server-side write confirmation. Save exactly that profile by following the storage resource. Confirm saving to the learner only after its read-back verification succeeds.

Never replace this evidence/claim process with a bare mastery boolean. Never claim the MCP server stored the profile: it did not.

## 6. Continue

Tell the learner what they showed, what to strengthen, and what to learn next. Use `newlyUnlocked` or `asfai_graph` actions `get_frontier` and `find_path` privately to choose the suggestion. Keep all system terminology and the private rubric out of learner-facing messages.
