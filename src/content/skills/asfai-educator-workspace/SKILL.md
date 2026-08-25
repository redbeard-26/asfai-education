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
6. After every mutation, use `asfai_storage`: load document `educator`, pass the current workspace to `save` with the prior digest as `expectedDigest`, and require `verified:true`. A connected Solid Pod is primary; identify the connector fallback accurately when no Pod is connected.

Prefer the authenticated Solid Pod. Never request passwords, access tokens, refresh tokens, DPoP keys, or cookies in chat.

For rooms, keep the teacher-owned definition in the educator workspace and an exchange copy in classroom document storage. Sign assignment and feedback envelopes with `asfai_storage`. Accept learner reports only after signature, digest, recipient, and replay checks succeed; do not collect raw conversation by default.
