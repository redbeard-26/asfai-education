---
name: asfai-storage-drive
description: The only instructions for saving ASFAI learner, educator, classroom, course, and writing records in the user's Google Drive with the assistant's own Drive connector — layout, loading, saving, files, references, and sharing.
---

# Saving to Google Drive

This is the single source of instructions for saving ASFAI data in Google Drive. Other ASFAI guidance only says to save "in the user's store"; when that store is Google Drive, follow this resource.

Google Drive is written by the assistant's own Google Drive connector. ASFAI never receives Drive credentials, never calls the Drive API, and never sees Drive file content. Never send Drive file content to an ASFAI tool, and never ask the user for Google passwords or tokens.

## When to use

Use Drive only when the assistant has its own Google Drive connector that can create, read, and update files in the user's My Drive. Search My Drive for a folder named `ASFAI` that contains `asfai-store.json`; if found, the user has a Drive store. Use it when the user asks ("save to my Google Drive") or has already chosen it. If the user also has another ASFAI store, ask once which one to use and keep using it; never split one person's records across stores.

To set up a new store, with the user's agreement create the `ASFAI` folder in My Drive and upload `asfai-store.json` containing:

```json
{ "schemaVersion": "0.1", "store": "google_drive", "layoutVersion": 1, "createdAt": "<now>" }
```

Never use a shared drive. `asfai_storage` action `instructions` with `target: { "mode": "google_drive" }` (plus `"location": "<ASFAI folder ID>"` once known) returns the file location and content type for a `document` or an `objectPath`; do the Drive work as described here.

## Storage target

When an ASFAI tool asks for a `storage` target (for example `record_learning`), pass `{ "mode": "google_drive" }`, adding `"location": "<ASFAI folder ID>"` once known.

## Layout

```text
My Drive/ASFAI/
  asfai-store.json
  learner.json  educator.json  classroom.json
  courses/<course-id>/manifest.json
  courses/<course-id>/versions/<course-version>/course.json
  courses/<course-id>/versions/<course-version>/materials/<material-version-id>/original.<ext> | pages.ndjson | chunks.ndjson | lexical-index.json
  learner-course-access/<course-id>.json
  writing/<assignment-id>/essay-v<N>.txt | feedback-v<N>.json | revision-v<N>.json
```

Each `/` is a subfolder. Signing keys do not exist in Drive (see Limits).

## Format

Upload plain files: JSON as `application/json`, text as `text/plain; charset=utf-8`, and originals in their own type. Do not convert files to Google Docs, Sheets, or Slides; conversion changes the exact content. When an essay came from a Google Doc, keep that Doc where it is and record its ID as the source.

## Records (learner, educator, classroom)

1. Read `ASFAI/<document>.json` and parse it. If it does not exist, start from `asfai_storage` action `initialize`. Note the file's modified time.
2. Before saving, read the file's metadata again. If the modified time changed, reload and reconcile instead of overwriting.
3. Replace the file's content with the complete updated JSON, or create the file if it does not exist.
4. Read it back, parse it, and confirm it is identical to what was written. Say it is saved only then.

## Files

1. Find or create each subfolder in the path inside `ASFAI`.
2. List the folder to find the next version number. A missing folder means the first version.
3. If a file with the target name already exists, do not overwrite it: saved course material and essay drafts are immutable. Use the next version name.
4. Upload the file, read it back, and confirm the content and size match. Say it is saved only then.
5. Delete a file only after confirming nothing active refers to it.

## References

Refer to a saved Drive file as:

```json
{ "storage": "google_drive", "fileId": "<Drive file ID>", "path": "writing/machu-picchu/essay-v1.txt", "mediaType": "text/plain", "bytes": 1234, "immutable": true }
```

Add `sha256` or `revisionId` only when Drive reports them. In a learner `artifacts` entry, set `provenance.system` to `"google-drive"` and `provenance.externalId` to the file ID.

## Sharing

Files stay private. Share a file or folder only after the user confirms the recipient and access level, and never more than read access unless asked.

- **Course access:** when `asfai_resource` action `prepare_course_share` returns a grant for a Drive course (`signingRequired: false`), share the course version folder read-only with the recipient after the educator confirms. Revoke by removing that access.
- **Teacher feedback:** a teacher may save approved writing feedback in the teacher's own `ASFAI/writing/` folder and, after confirming, share that file read-only with the student.
- A teacher's Drive connector cannot write into a student's Drive; students save their own records.

## Limits

- Signing needs a Pod identity. Drive users cannot sign progress envelopes or course grants; Drive sharing controls access instead.
- Only the assistant can reach the files. If the assistant has no Drive connector, say saving to Drive is not available here and offer the user's other options.
