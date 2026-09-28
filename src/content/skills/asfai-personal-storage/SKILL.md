---
name: asfai-personal-storage
description: Connect, read, or write learner, educator, classroom, and course data in the user's own storage — a PrivateDataPod or other Solid Pod through the authenticated ASFAI connector, or Google Drive through the assistant's own Drive connector.
---

# ASFAI personal storage

Private education data lives only in storage the user owns. Two stores are supported:

- **Solid Pod**, written by `asfai_storage` on the authenticated ASFAI Learning connector.
- **Google Drive**, written by the assistant's own Google Drive connector. ASFAI never receives Drive credentials, never calls Drive, and never sees Drive file content.

Both stores use the same layout, so records can move between them. Provider credentials are accepted only by the provider's own authorization page, never as tool arguments or chat messages.

## Choose the store

1. Call `asfai_storage` action `status`. If it reports `solid_pod` with `isLoggedIn:true`, a Pod is available.
2. If the assistant has a Google Drive connector, search My Drive for a folder named `ASFAI` containing `asfai-store.json`. If found, a Drive store is available.
3. If only one is available, use it. If both are, ask the user once which one to use and keep using it; never split one person's records across both. If neither is, offer to connect a Pod (`connect_pod`) or set up a Drive store, or continue without saving.

If the user says "connect my private Pod," "use my PrivateDataPod," or equivalent, call `status` immediately and continue with `connect_pod` when needed. If the user says "save to my Google Drive" or equivalent, use the Drive store. Treat these as action requests, not requests for architectural advice.

## Solid Pod

The storage gateway supports:

- `status` reports `solid_pod` or `not_connected` without exposing credentials. It silently restores a valid Pod grant. If it returns `isLoggedIn:true`, continue directly to `load`.
- `connect_pod` uses payload `{ "podRoot": "https://<name>.privatedatapod.com/", "oidcIssuer": "https://privatedatapod.com/" }` for PrivateDataPod. Show the returned link once and poll `status` after approval. The encrypted grant follows the authenticated connector across chats and supported devices until explicit removal or provider revocation.
- `load` uses payload `{ "document": "learner" }`, `{ "document": "educator" }`, or `{ "document": "classroom" }`. `save` uses the same `document`, the complete updated `value`, and the prior load `digest` as `expectedDigest` so a concurrent change cannot be overwritten silently.
- `identity`, `sign`, and `verify_signature` use a connector-scoped Ed25519 key for classroom envelopes. The private key is never exported.
- `put_object`, `get_object`, `head_object`, `list_objects`, and `delete_object` manage large course resources under the Pod's `asfai/` container with digest checks and bounded reads. Use these for files and extracted course text rather than placing them in educator JSON.
- `forget_pod_authorization` removes the reusable Pod grant from this connector. Call it only after an explicit user request; never as session cleanup.

Pod documents are stored at `<pod-root>/asfai/learner.json`, `<pod-root>/asfai/educator.json`, and `<pod-root>/asfai/classroom.json`; course objects live under `<pod-root>/asfai/courses/`. Say that data is saved only when the tool returns `verified:true` after read-back.

## Google Drive

Call `asfai_storage` action `instructions` with `target: { "mode": "google_drive" }` (add `"location": "<ASFAI folder ID>"` once known) to get the exact steps. Pass `document` for `learner`, `educator`, or `classroom`, or `objectPath` and `contentType` for a file. The steps come back to the assistant; do the Drive work with the assistant's own Drive connector.

- **Store:** one folder named `ASFAI` in the user's My Drive, marked by `asfai-store.json`. Create it only with the user's agreement. Never use a shared drive.
- **Documents:** `ASFAI/learner.json`, `ASFAI/educator.json`, `ASFAI/classroom.json`. Load by reading and parsing the file; start from `asfai_storage` action `initialize` if it does not exist. Before saving, check the file's modified time again; if it changed, reload and reconcile instead of overwriting.
- **Files:** the same paths as the Pod under `ASFAI/`, such as `ASFAI/courses/...` and `ASFAI/writing/...`, as subfolders. Saved files are never overwritten; a new version gets a new name. Refer to a saved file as `{ "storage": "google_drive", "fileId", "path", "mediaType", "bytes", "immutable": true }`.
- **Format:** upload plain files (`application/json`, `text/plain`). Do not convert to Google Docs, because conversion changes the exact content.
- **Verification:** read the file back and confirm it is identical to what was written before saying it is saved.
- **Sharing:** files stay private. Share a file or folder only after the user confirms the recipient and access level.
- **Limits:** signing (`identity`, `sign`) needs a Pod, so Drive users cannot sign progress envelopes or course grants. Drive sharing controls access instead.

Do not send Drive file content to ASFAI tools. `asfai_storage` action `verify` is not needed for Drive; the assistant compares the read-back itself.

## Records

The learner document may contain a top-level `artifacts` map. Evidence events link entries through `artifactIds`. Keep full transcript text inline only through the 8,192-byte UTF-8 cutoff; otherwise retain a summary of at most 2,000 characters and a provider/object reference. Binary artifact content stays outside `learner.json`.

There is no ASFAI-hosted fallback for private education data. If no store is available, continue without persistence or return portable JSON.

For teacher/student exchange, use `asfai_evidence` to create an integrity-protected progress envelope, `asfai_storage` to sign the exact envelope (Pod only), and `asfai_resource` to queue or accept the envelope. Share only the scoped envelope the learner approved, never the full profile or raw conversation.

## Essays and writing feedback

Save a student's essay and its feedback in the student's own store, from the student's own chat, and only after the student agrees. A teacher's connector cannot write to a student's Pod or Drive.

Keep each assignment in one folder, `writing/<assignment-id>/`, where the ID is a short lowercase slug such as `machu-picchu`. Never overwrite a saved essay; every draft gets its own version number.

1. Choose the store as above. If there is none, continue without saving.
2. List `writing/<assignment-id>` to find the next version number `N`; if the folder does not exist yet, `N` is 1. (Pod: `list_objects` with `containerPath`. Drive: list the subfolder.)
3. Save the essay exactly as the student wrote it as `writing/<assignment-id>/essay-v<N>.txt` with content type `text/plain; charset=utf-8`. (Pod: `put_object`; keep the returned `digest`. Drive: upload a plain text file; keep the file ID. If the essay came from a Google Doc, also record that Doc's ID as its source.)
4. Save the teacher-approved feedback as `writing/<assignment-id>/feedback-v<N>.json` with content type `application/json`, containing `essayRef` (the essay's path plus its Pod digest or Drive file ID), the approved grade and feedback, `approvedBy: "teacher"`, and `savedAt`. Passage offsets in the feedback refer to that essay version.
5. After the student revises, save the new draft as `essay-v<N+1>.txt`, then save the revision check as `revision-v<N+1>.json` with references to both drafts and the checks.
6. Load the learner document and add one `artifacts` entry per essay version: a new `id`, `createdAt`, `kind: "document"`, `mediaType: "text/plain"`, `byteLength`, `provenance.system` (`"asfai-pod"` or `"google-drive"`), `provenance.externalId` (the Pod object path or the Drive file ID), `sha256` when the store reports it, and a `transcript` with `method: "learner-authored"`, `reviewStatus: "learner-confirmed"`, `complete: true`, and the full text only when it is at most 8,192 bytes, otherwise a summary of at most 2,000 characters. Save the learner document with the conflict check for that store.
7. Tell the student it is saved only after every write is verified by read-back. Record evidence from the essay only through `asfai_evidence` with the student's approval.

With a Pod, these storage calls are the only ASFAI calls that carry the essay text; the gateway writes it to the student's Pod and does not keep a copy (`serverRetained: false`). With Drive, the essay never reaches ASFAI.

A teacher using Drive may also save the approved feedback in the teacher's own `ASFAI/writing/` folder and, after confirming, share that file read-only with the student.
