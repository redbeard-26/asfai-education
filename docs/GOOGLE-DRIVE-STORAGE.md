# Google Drive storage

ASFAI can save private education data in a user's Google Drive as an alternative to a Solid Pod. Drive is a **host-side store**: the user's AI assistant reads and writes Drive with its own Google Drive connector. ASFAI never receives Drive credentials, never calls the Drive API, and never sees Drive file content. ASFAI supplies the folder layout, the write and read-back steps, the file reference format, and validation of the JSON records the assistant builds.

| | Solid Pod | Google Drive |
|---|---|---|
| Who writes | `asfai_storage` on the ASFAI connector | The assistant's own Drive connector |
| Data passes through ASFAI | Yes, in memory only (`serverRetained: false`) | No |
| Authorization | Hosted Solid OIDC, encrypted grant on the ASFAI connector | The assistant's Google connection; ASFAI holds nothing |
| Conflict check | SHA-256 digest (`expectedDigest`) | File modified time |
| Read-back check | Done by `asfai_storage` (`verified: true`) | Done by the assistant, comparing the file to what it wrote |
| Signing (`identity`, `sign`) | Supported | Not supported; Drive sharing controls access |
| Sharing | Solid access grants | Drive sharing, only after the user confirms |

## Layout

One folder named `ASFAI` in the user's My Drive holds everything, using the same paths as the Pod's `asfai/` container:

```text
My Drive/ASFAI/
  asfai-store.json          store marker: {"schemaVersion":"0.1","store":"google_drive","layoutVersion":1,"createdAt":"..."}
  learner.json              learner profile
  educator.json             educator workspace
  classroom.json            classroom exchange document
  courses/<courseId>/versions/<version>/...   course originals, extracted text, indexes, manifests
  writing/<assignment-id>/essay-v1.txt        essay drafts, feedback, and revision checks
```

The assistant finds the store by searching My Drive for an `ASFAI` folder that contains `asfai-store.json`, and creates both only with the user's agreement. Shared drives are not used.

## Rules for the assistant

- Upload plain files: JSON as `application/json`, text as `text/plain`. Do not convert them to Google Docs, Sheets, or Slides, because conversion changes the exact content.
- Load a document by reading and parsing it. Before saving, check the modified time again; if it changed, reload and reconcile instead of overwriting.
- Saved file objects (course material, essays) are immutable. A new version gets a new file name.
- Say data is saved only after reading the file back and confirming it matches what was written.
- Keep files private. Share a file or folder only after the user confirms the recipient and access level.
- Never send Drive file content to ASFAI tools, and never ask the user for Google passwords or tokens.

`asfai_storage` action `instructions` returns these steps for a specific target:

```json
{ "action": "instructions", "payload": { "owner": "learner", "target": { "mode": "google_drive" } } }
{ "action": "instructions", "payload": { "owner": "educator", "document": "classroom", "target": { "mode": "google_drive", "location": "<ASFAI folder ID>" } } }
{ "action": "instructions", "payload": { "owner": "learner", "objectPath": "writing/machu-picchu/essay-v1.txt", "contentType": "text/plain; charset=utf-8", "target": { "mode": "google_drive" } } }
```

## File references

Records point to Drive files with a reference that ASFAI validates alongside Pod references:

```json
{ "storage": "google_drive", "fileId": "<Drive file ID>", "path": "courses/bio-7/versions/1/original.pdf", "mediaType": "application/pdf", "bytes": 482113, "immutable": true }
```

`sha256` and `revisionId` are optional and are added when the Drive connector reports them. Course materials, educator resources (`contentRef`), and course access grants (`manifestRef`) accept either a Pod or a Drive reference.

## Choosing a store

An assistant calls `asfai_storage` action `status` and, when it has a Drive connector, looks for the Drive store. If only one exists it is used; if both exist the assistant asks the user once which to use. One person's records are never split across both stores. With neither, the assistant continues without saving or returns portable JSON.

## Limits

- Signed progress envelopes and signed course grants need a Pod identity. Drive users share progress and courses through Drive sharing and unsigned envelopes.
- Access to a Drive course for a learner is granted by sharing the course version folder read-only after the educator confirms, and revoked by removing that access.
- The ASFAI web app keeps using IndexedDB and Solid Pods; Drive storage is available through AI assistants that have a Drive connector.
- A Classroom import with attachment content still passes Drive text through the ASFAI connector. To keep a document away from ASFAI entirely, read it with the assistant's own Drive connector instead.
