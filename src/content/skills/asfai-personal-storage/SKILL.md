---
name: asfai-personal-storage
description: Connect, read, or write learner, educator, classroom, and course data in a PrivateDataPod or other Solid Pod through the authenticated ASFAI connector.
---

# ASFAI personal storage

Use `asfai_storage` on the authenticated ASFAI Learning connector when the conversation must connect, load, or save private learner, educator, or classroom state. It is already the Solid bridge; do not look for another Pod connector or local companion. Provider credentials are accepted only by the provider's hosted authorization page, never as tool arguments or model-visible results.

If the user says "connect my private Pod," "use my PrivateDataPod," or equivalent, call `asfai_storage` with action `status` immediately and continue with `connect_pod` when needed. Treat this as an action request, not a request for architectural advice.

The storage gateway supports:

- `status` reports `solid_pod` or `not_connected` without exposing credentials. It silently restores a valid Pod grant. If it returns `isLoggedIn:true`, continue directly to `load`.
- `connect_pod` uses payload `{ "podRoot": "https://<name>.privatedatapod.com/", "oidcIssuer": "https://privatedatapod.com/" }` for PrivateDataPod. Show the returned link once and poll `status` after approval. The encrypted grant follows the authenticated connector across chats and supported devices until explicit removal or provider revocation.
- `load` uses payload `{ "document": "learner" }`, `{ "document": "educator" }`, or `{ "document": "classroom" }`. `save` uses the same `document`, the complete updated `value`, and the prior load `digest` as `expectedDigest` so a concurrent change cannot be overwritten silently.
- `identity`, `sign`, and `verify_signature` use a connector-scoped Ed25519 key for classroom envelopes. The private key is never exported.
- `put_object`, `get_object`, `head_object`, `list_objects`, and `delete_object` manage large course resources under the Pod's `asfai/` container with digest checks and bounded reads. Use these for files and extracted course text rather than placing them in educator JSON.
- `forget_pod_authorization` removes the reusable Pod grant from this connector. Call it only after an explicit user request; never as session cleanup.

Pod documents are stored at `<pod-root>/asfai/learner.json`, `<pod-root>/asfai/educator.json`, and `<pod-root>/asfai/classroom.json`; course objects live under `<pod-root>/asfai/courses/`. There is no remote fallback for private education data. If the tool reports `not_connected`, connect a Pod, continue without persistence, or return portable JSON. Say that data is saved only when the tool returns `verified:true` after read-back.

The learner document may contain a top-level `artifacts` map. Evidence events link entries through `artifactIds`. Keep full transcript text inline only through the 8,192-byte UTF-8 cutoff; otherwise retain a summary of at most 2,000 characters and a provider/object reference. Binary artifact content stays outside `learner.json`.

For teacher/student exchange, use `asfai_evidence` to create an integrity-protected progress envelope, `asfai_storage` to sign the exact envelope, and `asfai_resource` to queue or accept the signed envelope. Share only the scoped envelope the learner approved, never the full profile or raw conversation.

## Essays and writing feedback

Save a student's essay and its feedback only in the student's own Pod, from the student's own chat with their Pod connected, and only after the student agrees. A teacher's connector cannot write to a student's Pod.

Keep each assignment in one folder, `writing/<assignment-id>/`, where the ID is a short lowercase slug such as `machu-picchu`. Never overwrite a saved essay; every draft gets its own version number.

1. Call `status`. If the Pod is not connected, offer `connect_pod` or continue without saving.
2. Call `list_objects` with `containerPath: "writing/<assignment-id>"` to find the next version number `N`; if the folder does not exist yet, `N` is 1.
3. Save the essay exactly as the student wrote it with `put_object`: `path: "writing/<assignment-id>/essay-v<N>.txt"`, `contentType: "text/plain; charset=utf-8"`, and `text`. Keep the returned `digest`.
4. Save the teacher-approved feedback with `put_object`: `path: "writing/<assignment-id>/feedback-v<N>.json"`, `contentType: "application/json"`, and `text` set to JSON containing `essayPath`, `essayDigest` (the digest from step 3), the approved grade and feedback, `approvedBy: "teacher"`, and `savedAt`. Passage offsets in the feedback refer to that essay version.
5. After the student revises, save the new draft as `essay-v<N+1>.txt`, then save the revision check as `revision-v<N+1>.json` with `previousEssayPath`, `revisedEssayPath`, both digests, and the checks.
6. Call `load` with `document: "learner"`, add one `artifacts` entry per essay version (a new `id`, `createdAt`, `kind: "document"`, `mediaType: "text/plain"`, `byteLength`, `sha256` set to the digest, `provenance.system: "asfai-pod"`, `provenance.externalId` set to the object path, and a `transcript` with `method: "learner-authored"`, `reviewStatus: "learner-confirmed"`, `complete: true`, and the full text only when it is at most 8,192 bytes, otherwise a summary of at most 2,000 characters). Call `save` with the prior `digest` as `expectedDigest`.
7. Tell the student it is saved only when every call returns `verified: true`. Record evidence from the essay only through `asfai_evidence` with the student's approval.

These storage calls are the only ASFAI calls that carry the essay text. The gateway writes it to the student's Pod and does not keep a copy (`serverRetained: false`).
