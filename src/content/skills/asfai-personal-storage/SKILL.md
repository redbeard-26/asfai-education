---
name: asfai-personal-storage
description: Connect ASFAI chat workflows to verified local JSON or a learner/teacher Solid Pod through one private companion MCP tool.
---

# ASFAI personal storage

Use the optional local `asfai-personal-storage` MCP companion when the conversation must load or save private learner, educator, or classroom state. The public AWS MCP remains stateless and must never receive Solid passwords, cookies, access tokens, refresh tokens, client secrets, or DPoP keys.

The companion exposes one tool, `asfai_personal_storage`:

- `status` reports the current local/Solid mode without exposing credentials.
- `configure_local` selects an approved local directory. `load` and `save` then use atomic JSON files under `asfai/` and verify every write by reading it back.
- `connect_solid` accepts only `podRoot` and `oidcIssuer`. Give the returned authorization URL to the user. The user authenticates on the Pod provider page; never ask them to paste credentials into chat. Poll `status` until `isLoggedIn` is true.
- `load` and `save` accept document `learner`, `educator`, or `classroom`. For updates, pass the prior digest as `expectedDigest` so a concurrent change cannot be overwritten silently.
- `identity`, `sign`, and `verify` use a local owner-controlled Ed25519 key for classroom envelopes. The private key is never exported or stored on the public server.
- `disconnect` clears the companion's application session. It does not require or perform an identity-provider-wide logout.

Pod documents are stored at `<pod-root>/asfai/learner.json`, `<pod-root>/asfai/educator.json`, and `<pod-root>/asfai/classroom.json`. Local documents use the same names under the configured directory. Say that data is saved only when the tool returns `verified: true` after read-back.

For teacher/student exchange, use `asfai_evidence` to create an integrity-protected progress envelope, `asfai_personal_storage` to sign the exact envelope, and `asfai_resource` to queue or accept the signed envelope. Share only the scoped envelope the learner approved, never the full profile or raw conversation.
