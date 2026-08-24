---
name: asfai-classroom-integration
description: Import or export assignments and student work through a configured classroom provider, evaluate the work against ASFAI learning objectives, and save concise evidence privately.
---

# ASFAI classroom integration

Use this guidance when a learner or teacher wants to move work between an AI conversation and a classroom system. The installed private companion exposes one provider-neutral tool named `asfai_classroom`. Always pass a provider identifier; pass `provider: "google"` for Google Classroom. Future providers should implement this same normalized workflow instead of adding an always-loaded tool for each vendor.

Keep classroom OAuth and private work at the local companion boundary. Do not send tokens, authorization codes, secrets, raw student submissions, or complete private profiles to the public ASFAI service. The public tools may receive only the learning objective IDs and the minimum excerpts or structured observations needed for the requested educational work.

## Natural conversation

Speak about the class, assignment, work, learning goal, feedback, and next step. Do not tell a learner that they are entering an interaction, running a skill, invoking an MCP tool, importing a schema, or generating an evidence event unless they ask for implementation details. Never ask a user to paste a classroom password, cookie, authorization code, access token, refresh token, or OAuth client secret into chat.

## Connect with least privilege

1. Call `asfai_classroom` action `status` with `{ "provider": "google" }` or the requested configured provider.
2. If disconnected, call `connect` with `role: "learner"` for the learner's own work or `role: "teacher"` for class submissions. Use `readOnly:true` when only importing. Set `includeDriveContent:true` only when the user asks to evaluate attachment contents and a reference or short answer is insufficient.
3. Give the returned authorization URL to the user as a simple “Connect classroom” link. After approval, check `status` until `isLoggedIn` is true.
4. If `configured:false`, say that the classroom administrator must configure the named provider's OAuth application. The user does not need a separate provider-specific MCP tool; `asfai_classroom` is the general bridge.

## Import and identify objectives

Use `list_courses`, teacher-only `list_learners`, and `list_assignments` only when the target cannot be inferred. Call `import_work` for a specific submission when possible. For a teacher, narrow by learner or submission before requesting attachment content. Preserve provider, course, assignment, submission, and artifact references as provenance, but do not retain the full imported response after the task.

If the assignment already identifies ASFAI objective IDs, use them. Otherwise use `asfai_graph` to search for candidate objectives and ask the teacher to confirm high-impact or ambiguous mappings. An assignment description is not proof that a learner demonstrated every listed objective.

## Evaluate dynamically

Choose the assessment method from the work actually submitted:

- For writing, inspect claims, organization, evidence, reasoning, revision state, and objective-specific criteria. Do not reduce a broad writing artifact to spelling alone.
- For mathematics or structured solutions, inspect representations, reasoning, transformations, checks, and errors—not only the final answer.
- For code, designs, games, or files that can be executed or inspected, use safe available inspection methods and record the tested behavior and limitations.
- For performances, presentations, collaborative work, or physical artifacts, use teacher/learner reports, recordings, photographs, observation notes, or a short follow-up conversation. Clearly identify indirect or incomplete evidence.
- When the submitted artifact is insufficient, ask one or two direct questions in learner-appropriate language to distinguish understanding from copying, guessing, or heavy assistance.

Use `asfai_evidence` to create objective-linked observations and assessment claims. Record assistance, rubric or criteria, provenance, confidence, limitations, and what would strengthen the conclusion. Do not convert a provider grade, completion flag, or turned-in state directly into mastery.

## Save before external passback

Before returning a grade or feedback, save the concise objective-level evidence and report through `asfai_personal_storage`:

1. Call `status` and connect the requested Pod or use the already configured local store.
2. Load the appropriate `learner`, `educator`, or `classroom` document.
3. Append the minimum useful evidence, assessment claim, and report reference. Avoid unnecessary personal data, full submission copies, and verbatim conversations.
4. Save the complete updated document with the prior digest as `expectedDigest`.
5. Treat it as saved only when the result has `verified:true`.

If saving fails, say that the result remains unsaved. Do not return a grade that implies the private evidence record was saved when it was not.

## Export with explicit confirmation

The following classroom actions change external state and always require a preview and explicit approval:

- `create_assignment` may create a draft or published assignment.
- `export_work` may create or attach a file/link and may turn in a submission.
- `return_evaluation` may set a draft or published grade and may return the submission.

Call the intended action with `confirmed:false`, describe the exact class, assignment, affected learner or submission, attachments, score, and state change in plain language, and ask for approval. Repeat it with `confirmed:true` only after the user approves that specific preview. A request to evaluate work is not permission to publish a grade, turn in work, or return a submission.

After creating an assignment linked to ASFAI objectives, save the provider/course/assignment-to-objective mapping in the educator or classroom document. Do not assume a classroom provider preserves ASFAI-specific metadata.

Google permits attachment changes and grade passback only for coursework associated with the same Google Developer project. Its Classroom API does not expose private feedback comments through this adapter. If a requested Google mutation is unavailable, keep the objective-level evidence owner-side and offer a teacher-readable report or an attachment the user can place manually.
