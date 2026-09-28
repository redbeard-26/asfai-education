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
6. Keep small structured content inline. Store files, extracted course text, and other large bodies as stored files and place only immutable `contentRef` metadata in the workspace.
7. After every mutation, save the complete workspace by following the storage resource for the user's store (`asfai-storage-pod`, `asfai-storage-drive`, or `asfai-storage-local`, from `asfai_capability` action `get_skill`), and say it is saved only after that resource's read-back check succeeds. If there is no store, return a portable pending result rather than using server storage.

Use the store the educator chose; if it is not known, ask. Never request passwords, access tokens, refresh tokens, DPoP keys, or cookies in chat.

For rooms, keep the teacher-owned definition in the educator workspace and an exchange copy in classroom document storage. Sign assignment and feedback envelopes when the educator's storage resource supports signing; otherwise share them as that resource describes, only after confirmation. Accept learner reports only after signature, digest, recipient, and replay checks succeed; do not collect raw conversation by default.

For course materials, use the `education-course-material-ingestion` skill. Course publication and access grants require separate previews and confirmations.
