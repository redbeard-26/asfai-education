---
name: asfai-educator-workspace
description: Create, version, organize, publish, share, revoke, export, and verify educator-owned ASFAI resources without server-side retention.
---

# ASFAI educator workspace

Use `asfai_resource` as an immutable reducer over the complete portable educator workspace.

1. Load the existing workspace from the chosen store. If none exists, call action `initialize`.
2. For generated content, run the chosen capability first, then call action `create` with title, kind, content, capability ID/version, source references, license, and whether AI helped create it.
3. Use action `version` for edits. Never overwrite an earlier resource version.
4. Use collections to organize work. Sharing and revocation are preview/confirm operations; show the scope and obtain explicit confirmation before the confirmed call.
5. Publication creates a status change only after explicit confirmation. Hosting executable artifacts also requires the authenticated publication and scanning pipeline described by the lesson-authoring guidance.
6. Keep small structured content inline. Store files, extracted course text, and other large bodies as Pod objects or Drive files and place only immutable `contentRef` metadata in the workspace.
7. After every mutation, save the complete workspace to the educator's store and confirm by read-back. With a Pod, use `asfai_storage`: load document `educator`, pass the current workspace to `save` with the prior digest as `expectedDigest`, and require `verified:true`. With Google Drive, follow the `asfai-personal-storage` Drive steps for `ASFAI/educator.json` using the assistant's own Drive connector. With neither, return a portable pending result rather than using server storage.

Use the store the educator chose (Solid Pod or Google Drive), as described in `asfai-personal-storage`. Never request passwords, access tokens, refresh tokens, DPoP keys, or cookies in chat.

For rooms, keep the teacher-owned definition in the educator workspace and an exchange copy in classroom document storage. Sign assignment and feedback envelopes with `asfai_storage` when a Pod is connected; Drive users cannot sign, so share Drive files only after confirmation instead. Accept learner reports only after signature, digest, recipient, and replay checks succeed; do not collect raw conversation by default.

For course materials, use the `education-course-material-ingestion` skill. Course publication and access grants require separate previews and confirmations.
