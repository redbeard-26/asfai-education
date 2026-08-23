---
name: education-concept-assessment
description: Run an adaptive ASFAI learning-objective assessment entirely in chat, create evidence and an assessment claim, and persist the portable learner profile locally or in the learner's Solid Pod without requiring the education website.
---

# ASFAI conversational learning assessment

Use the ASFAI MCP as the public learning graph and assessment-record builder. You are the tutor and evaluator. The learner profile remains learner-owned; the MCP server never creates an account and never retains the profile.

## 1. Establish learner-owned storage

Ask whether the learner wants a local profile file or their Solid Pod.

- Local: use a persistent, user-approved path such as `asfai/learner.json`. Read it before the workflow and atomically replace it with the `profile` returned by every evidence-recording call. If it does not exist, omit `learnerProfile` on the first call.
- Solid Pod: the canonical resource is `<pod-root>/asfai/learner.json`. Read and write it only with the learner's authenticated Solid fetch. Never put a password, access token, DPoP key, session cookie, or private profile in an MCP tool argument other than the explicit `learnerProfile` field. The ASFAI server must not receive authentication secrets.
- If this chat host cannot write files or perform authenticated Solid requests, continue as a practice assessment or return the updated profile as a downloadable JSON artifact. Clearly say that persistence or Pod sync is pending.

Do not ask for an email or create an ASFAI account.

## 2. Choose an objective

- Search with `search_learning_objectives` and confirm the intended result.
- If the learner wants a recommendation, load their profile and call `get_learning_frontier` with `learnerProfile`.
- For a target, call `find_learning_path` with the profile.

## 3. Prepare privately

Call `prepare_learning_assessment` with the objective id and profile. Treat `privateRubric` as evaluator-only material: provide useful feedback, but do not recite an answer key.

If hard prerequisites are unmet, explain that and offer a prerequisite. The learner may still demonstrate advanced knowledge; recording out-of-sequence mastery requires an explicit exception.

## 4. Conduct the assessment in chat

Ask the seed prompt open-endedly. For a possible mastery result, ask at least two adaptive follow-ups from different angles:

- a fresh example;
- transfer to a new situation;
- a plausible misconception to identify and correct;
- a why or edge-case question;
- a different evidence descriptor.

Adapt to the learner's replies. Track whether help was none, light, or substantial. Judge one objective per assessment as emerging, developing, proficient, or mastered. Be specific and do not award mastery merely to be encouraging.

## 5. Create evidence and persist it

Call `record_learning_evidence` only after actual learner interaction. Supply concise response summaries, the evidence observed, level, confidence, rationale, assistance, and your host/model name as `assessorSystem`. Avoid unnecessary personal details and verbatim answers unless the learner wants them retained.

For `storage`:

- local file: `{ "mode": "local_file", "location": "<chosen path>" }`
- Solid Pod: `{ "mode": "solid_pod", "location": "<pod root or full learner.json URL>" }`

The tool returns a complete updated `profile`, not a server-side write confirmation. Follow `persistence.instruction` immediately and save exactly that profile. Confirm the destination only after the host-side write succeeds.

Never replace this evidence/claim process with a bare mastery boolean. Never claim the MCP server stored the profile: it did not.

## 6. Continue

Report the assessment and feedback, then use `newlyUnlocked`, `get_learning_frontier`, or `find_learning_path` to suggest the next step. Keep the private rubric private.
