---
name: asfai-learning
description: Use or verify the ASFAI Learning plugin in chat to plan lessons, design evaluations, transform teaching assets, teach, assess, save to a Solid Pod or Google Drive, or exchange classroom work.
---

# ASFAI Learning

The installed plugin has exactly one authenticated remote MCP server, **ASFAI Learning**. Do not search for a separate Solid, storage, companion, Google Classroom, student, or teacher connector. Its callable surface is:

- `asfai_capability`, `asfai_graph`, `asfai_run`, `asfai_session`, `asfai_lesson`, `asfai_evidence`, and `asfai_resource` for learning and teaching workflows;
- `asfai_storage` for Pod private records, verified saves, identity, and signatures, and for Google Drive storage steps;
- `asfai_classroom` for provider-neutral classroom exchange.

When asked whether ASFAI is available, inspect those tools and, when possible, call `asfai_capability` action `manifest` or `asfai_storage` action `status`. Do not search the public plugin directory to decide whether this installed plugin is available. Plugin updates load in a new chat.

## Speak naturally

Keep orchestration private. With a learner, say what they are learning and ask the real question. Do not mention an interaction, skill, tool, MCP, workflow, rubric, evidence event, assessment claim, or telemetry unless the learner asks how the system works. Give feedback in ordinary subject language.

## Use only the guidance needed

For a new goal, use `asfai_capability` to recommend the relevant capability and install detailed guidance only when needed. Use `asfai_graph` for objectives and paths, `asfai_lesson` for lessons, and `asfai_evidence` for assessment records. Keep private evaluator guidance and answer keys out of learner-facing messages.

For teacher requests, retrieve `education-lesson-authoring` when making or polishing an outline or full plan, `education-evaluation-design` when designing an evaluation from a completed lesson plan, and `education-asset-transform` when converting an existing source to a new representation. These are available through `asfai_capability` action `get_skill` or `install_skill`; do not add three more always-on MCP connectors. Use `asfai_lesson` actions `prepare_outline` and `validate_outline`, `asfai_evidence` actions `design_evaluation` and `validate_evaluation`, and `asfai_resource` actions `prepare_transform` and `validate_transform`. Ask the returned questions before generating; the chat host creates content and ASFAI validates the resulting artifact.

## Save to the user's own store

Private records are saved only in storage the user owns: a Solid Pod, written through `asfai_storage`, or Google Drive, written by the assistant's own Google Drive connector. ASFAI never receives Drive credentials or Drive file content.

Before relying on personal state, call `asfai_storage` action `status`. If it reports `mode:"solid_pod"` and `isLoggedIn:true`, load the requested document immediately. Do not start another authorization. If the assistant has a Google Drive connector, also look in My Drive for an `ASFAI` folder containing `asfai-store.json`. If both stores exist, ask the user once which to use; never split one person's records across both.

If the user asks to connect a Pod and no valid Pod grant is restored, call `asfai_storage` action `connect_pod` with the Pod root and OIDC issuer. For PrivateDataPod use:

```json
{
  "action": "connect_pod",
  "payload": {
    "podRoot": "https://<name>.privatedatapod.com/",
    "oidcIssuer": "https://privatedatapod.com/"
  }
}
```

Show the returned URL as **Connect private storage**. Never request a password, cookie, authorization code, access token, refresh token, client secret, or DPoP key in chat. After approval, call `status` again. The grant persists for this authenticated connector until the user explicitly forgets it or revokes it at the provider.

Load with payload `{ "document": "learner" }`, `{ "document": "educator" }`, or `{ "document": "classroom" }`. Save the complete updated document with the digest returned by `load` as `expectedDigest`. Say data was saved only when `save` returns `verified:true` after read-back. If status reports `not_connected` and there is no Drive store, connect a Pod, set up a Drive store, or continue without persistence; ASFAI retains no fallback education record.

To use Google Drive, call `asfai_storage` action `instructions` with `target: { "mode": "google_drive" }` and the `document` or `objectPath` to save, then follow the returned steps with the assistant's Drive connector. Keep files in the user's `ASFAI` folder in My Drive, upload plain JSON or text (never convert to Google Docs), never overwrite a saved file object, share nothing without confirmation, and say saved only after reading the file back and confirming it matches. Signing needs a Pod, so Drive users cannot sign progress envelopes. Load `asfai-personal-storage` for the full steps.

For course ingestion use the `education-course-material-ingestion` skill. For teacher or learner questions against approved sources use `education-source-grounded-chat`. The host assistant performs extraction, retrieval judgment, teaching, and answer generation. Use Pod object operations or Drive files for original files and derived text, leaving only references in educator state.

Never call `forget_pod_authorization` as cleanup. Use it only after an explicit request to forget or revoke the Pod connection.

Record concise evidence rather than a bare mastery flag. Avoid unnecessary personal details and verbatim chat. Share progress with a teacher only after learner approval, using a scoped envelope (signed when the learner has a Pod) instead of the full profile.

## Exchange classroom work

Every `asfai_classroom` call includes a provider. Use `provider:"google"` for Google Classroom today. Future providers use the same tool.

1. Call `status` with `{ "provider": "google" }`.
2. If already logged in with sufficient scopes, continue without another consent page.
3. Otherwise call `connect` with `role`, least privilege, and provider. Default to `readOnly:true`. Set `includeDriveContent:true` only when attachment text is needed. Use writable access only for a user-requested external change. Show the URL as **Connect classroom** and check status after approval.
4. Use `list_courses`, teacher-only `list_learners`, and `list_assignments` only as needed. Use `import_work` for the selected assignment or submission and only the attachment content needed for evaluation.
5. Resolve objectives with `asfai_graph`, assess demonstrated work with `asfai_evidence`, and save concise evidence in the user's store (Pod or Drive) before optional grade passback.

The classroom bridge transports work; it does not decide mastery. A grade or submission state alone is not evidence. Preserve assistance, provenance, uncertainty, rubric references, and limitations.

For an artifact retained by a classroom provider, keep a provider-neutral reference in the learner profile. Store a complete transcript inline only when it is at most 8,192 UTF-8 bytes. Above that, store a summary of at most 2,000 characters plus the external reference. Never base64-encode an original image, audio, video, or document into the learner profile.

## Create assignments and documents

Use `asfai_classroom` action `create_assignment` with a provider-neutral assignment. Existing links, Drive file IDs, and YouTube materials go in `materials`. New teacher-authored documents go in `documents` with a title, content, content type, `format:"google_doc"` or `format:"file"`, and a `shareMode` of `VIEW`, `EDIT`, or `STUDENT_COPY`. Default to `VIEW`; use `STUDENT_COPY` when each learner needs an editable personal copy. Keep the total materials and generated documents at 20 or fewer.

First call with `confirmed:false`. Explain the course, assignment state, due date, files to be created, and who will see them. Only repeat with `confirmed:true` after explicit teacher approval. The Google adapter creates the Drive documents and attaches them to coursework created by the configured ASFAI Google project. Preserve the returned provider IDs in the educator or classroom record together with objective mappings.

Use the same preview-then-confirm pattern for `export_work` and `return_evaluation`. Never infer permission to publish an assignment, create Drive documents, attach or turn in work, publish a grade, or return a submission. Never call `forget_authorization` unless the user explicitly asks to remove the classroom connection.

Google permits attachment changes and grade passback only for coursework associated with the same Google Developer project. If Google reports that restriction, preserve the private evidence and offer a teacher-readable export.
