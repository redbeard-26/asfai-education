---
name: asfai-learning
description: Use or verify the installed ASFAI Learning plugin in chat to teach, learn, assess, plan lessons, save progress, connect/read/write a PrivateDataPod or other Solid Pod, or import/export work through a configured classroom provider. Trigger when a user asks whether ASFAI is installed/available, asks to use ASFAI, says "connect my private Pod," "save my learning progress," "continue my ASFAI lesson," or "import my Classroom assignment."
---

# ASFAI learning

This installed plugin already includes the public ASFAI education MCP and a private local companion. Use the public ASFAI MCP for learning objectives, lesson guidance, assessment preparation, and portable record construction. Use private `asfai_personal_storage` for learner-, teacher-, and classroom-owned storage. Use private `asfai_classroom` to exchange work with a configured classroom provider. The public service must not receive Solid credentials, classroom OAuth tokens, raw private student work, private signing keys, or complete private profiles.

## Recognize the installed plugin

`ASFAI Learning` is the plugin's display name; it does not expose a tool named `asfai_learning` or `ASFAI Learning`. Its callable surface is:

- public `asfai_capability`, `asfai_graph`, `asfai_run`, `asfai_session`, `asfai_lesson`, `asfai_evidence`, `asfai_resource`, and `asfai_storage`;
- private local `asfai_personal_storage` and `asfai_classroom`.

When asked whether ASFAI is available, inspect the callable tools for those names and, when possible, call `asfai_capability` action `manifest` or `asfai_personal_storage` action `status`. Do not search the public plugin directory or registry to decide whether this locally installed personal-marketplace plugin is present. A directory search lists installable directory entries and can miss a locally installed plugin.

Plugins and updated plugin versions are loaded when a new chat starts. If this skill is visible but the expected ASFAI tools genuinely are not callable, say that the current chat did not load the enabled plugin and ask the user to start a new chat after confirming the ASFAI Learning toggle is on. Do not report the plugin as uninstalled solely because the tool name `asfai_learning` is absent.

When a user asks to connect, use, read, or write a private Pod, do not answer with generic connector architecture, search for a separate Solid connector, or say that a bridge must be built. Call `asfai_personal_storage` with action `status` immediately. Only explain a surface limitation if that tool is genuinely unavailable after checking the available tools.

## Speak naturally

Keep orchestration private. With a learner, state what they are learning and ask the real question. Do not mention an interaction, skill, tool, MCP, workflow, session, rubric, evidence event, assessment claim, telemetry, or similar machinery unless the learner asks how the system works. Do not narrate setup stages. Give feedback in ordinary language about what the learner understands and what to try next.

## Get only the guidance needed

For a new goal, use `asfai_capability` to recommend the relevant capability and install its detailed guidance only when needed. Use `asfai_graph` for objectives and paths, `asfai_lesson` for lessons, and `asfai_evidence` for assessment records. Do not expose private evaluator guidance or answer keys.

## Save without setup instructions

Before relying on personal state, call `asfai_personal_storage` with action `status`. Status silently restores valid saved Solid authorization for this device user. If it returns `isLoggedIn:true`, load the requested document immediately; do not call `connect_solid`, show a consent page, or ask the user to authorize again. Treat "connect my private Pod" and equivalent wording as a request to perform this workflow now, not as a request for setup documentation.

- If the user wants this device, load the appropriate `learner`, `educator`, or `classroom` document and continue. Local storage is already configured; do not ask them to choose folders or run commands.
- If the user asks for a Solid Pod and status did not restore it, obtain the Pod address if it is not known. For a `privatedatapod.com` Pod, call `connect_solid` with payload `{ "podRoot": "https://<name>.privatedatapod.com/", "oidcIssuer": "https://privatedatapod.com/" }`. If it restores authorization and returns no authorization URL, continue immediately. Otherwise show the returned URL as a simple "Connect private storage" link and ask the user to approve access once on the provider page. Never ask them to paste a password, cookie, token, refresh token, client secret, or DPoP key into chat. After approval, check `status` until `isLoggedIn` is true. The saved authorization persists across chats and restarts until the user explicitly forgets it or revokes it at the provider.
- Load with payload `{ "document": "learner" }`, `{ "document": "educator" }`, or `{ "document": "classroom" }` before updating. Save the complete updated value and pass the digest returned by `load` as `expectedDigest` so newer data is not silently overwritten.
- Say that data is saved only when `save` returns `verified: true` after read-back. If storage is unavailable, continue only as unsaved practice and say so plainly.
- Never call `forget_solid_authorization` as cleanup. Use it only after an explicit request such as “forget this Pod on this device” or “revoke this connection.” Ending a lesson, chat, MCP process, application, or computer session must not remove authorization.

Record concise learning evidence rather than a bare mastery flag. Avoid unnecessary personal details and verbatim conversation. Share progress with a teacher only after learner approval, using a scoped signed envelope instead of the complete learner profile.

## Exchange classroom work

Treat Classroom as a category, not a Google-specific tool. Every `asfai_classroom` call must include a provider identifier. Pass `{ "provider": "google" }` for Google Classroom today; use the provider requested by the user when another configured adapter becomes available.

Keep the learner-facing conversation natural. Ask which class or assignment they mean in ordinary language when it cannot be inferred. Do not narrate connector, MCP, skill, schema, import pipeline, or persistence machinery unless the user asks how it works.

### Connect and import

1. Call `asfai_classroom` action `status` with payload `{ "provider": "google" }`.
2. If it is configured but not connected, call `connect` with `role`, the least access needed, and the same provider. Use `readOnly:true` for import-only work. Set `includeDriveContent:true` only if reading attachment text is necessary. Show the returned link as “Connect classroom,” never ask for credentials or tokens in chat, and check `status` after the user approves.
3. Use `list_courses`, teacher-only `list_learners`, and `list_assignments` only as needed to identify the target. Then call `import_work` with the provider, course and assignment, a specific learner or submission when known, and relevant `objectiveIds`. Import only the selected learner's work and only the attachment text needed for the requested evaluation.
4. If the provider is not configured, explain that an administrator must configure that provider's OAuth application. Do not claim a separate Google-specific MCP tool is needed; `asfai_classroom` is the installed bridge.

### Evaluate and save

The classroom bridge transports work; it does not decide mastery. Resolve or confirm the intended objectives with `asfai_graph`, then use `asfai_evidence` to assess only what the work demonstrates. Preserve assistance, provenance, uncertainty, rubric references, and limitations. A grade or submission state alone is not learning evidence.

Save concise evidence and any objective-level feedback through `asfai_personal_storage` before grade passback. Load the owner document, append the evidence or report, save with `expectedDigest`, and require `verified:true`. Do not persist the complete imported submission, OAuth material, unnecessary personally identifying data, or a verbatim chat transcript. If private saving fails, say plainly that the evaluation has not been saved and do not imply otherwise.

When a student artifact remains in Classroom or another owner-controlled system, keep a provider-neutral reference in the learner profile's top-level `artifacts` map and link relevant evidence events through `artifactIds`. Each entry uses `{ id, createdAt, kind, title?, mediaType?, byteLength?, sha256?, provenance:{ system, externalId?, url?, retrievedAt? }, transcript?:{ text?, summary?, language?, method, reviewStatus, confidence?, complete } }`. A short artifact transcript is useful evidence and is not the same as retaining a verbatim chat: store the complete transcript inline only when it is at most 8,192 UTF-8 bytes. Above that limit, store a summary of at most 2,000 characters plus the external reference. Never base64-encode the original image, audio, video, or document into `learner.json`. Mark AI transcription as `method:"ai-transcribed"`, `reviewStatus:"unreviewed"`, and `complete:false` when any text is obscured; retain confidence when estimated. Keep transcript text and the complete private profile at the local companion boundary rather than sending them to the public ASFAI service.

When a newly created classroom assignment is linked to ASFAI objectives, save the provider/course/assignment-to-objective mapping in the educator or classroom document. Classroom providers may not offer portable custom metadata fields, so do not rely on the provider to retain that mapping.

### Export or return results

Use `create_assignment`, `export_work`, or `return_evaluation` first with `confirmed:false`. Explain the concrete external change in plain language and ask the affected learner or teacher to approve it. Only repeat the same call with `confirmed:true` after explicit approval. Never infer permission to publish an assignment, attach or turn in student work, publish a grade, or return a submission.

Google currently permits attachment changes and grade passback only for coursework associated with the same Google Developer project. If the tool reports that limitation, preserve the local evidence and offer a non-destructive export or teacher-readable report. The Google Classroom API does not provide private feedback comments through this adapter, so store detailed objective-level feedback privately and send only the approved score and submission state to Classroom.
