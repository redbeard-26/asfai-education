---
name: asfai-personal-storage
description: Connect, read, or write PrivateDataPod and other Solid Pods directly from ASFAI chat through the installed private-storage MCP bridge, or persist verified local JSON without a website.
---

# ASFAI personal storage

Use the local `asfai-personal-storage` MCP companion when the conversation must connect, load, or save private learner, educator, or classroom state. The companion is the Solid-to-MCP bridge; do not tell the user that another bridge or generic Solid connector must be built. The public AWS MCP remains stateless and must never receive Solid passwords, cookies, access tokens, refresh tokens, client secrets, or DPoP keys.

If the user says "connect my private Pod," "use my PrivateDataPod," or equivalent, call `asfai_personal_storage` with action `status` immediately and continue with `connect_solid` when needed. Treat this as an action request, not a request for architectural advice.

The companion exposes one tool, `asfai_personal_storage`:

- `status` reports the current local/Solid mode without exposing credentials. It also silently restores a saved Solid authorization for this device user when the Pod grant remains valid. If it returns `isLoggedIn:true`, continue directly to `load`; do not call `connect_solid` or send the user to a web page.
- `configure_local` selects an approved local directory. `load` and `save` then use atomic JSON files under `asfai/` and verify every write by reading it back.
- `connect_solid` uses payload `{ "podRoot": "https://<name>.privatedatapod.com/", "oidcIssuer": "https://privatedatapod.com/" }` for PrivateDataPod. Call it only when `status` could not restore the requested Pod. Give the returned authorization URL to the user. The user authenticates once on the Pod provider page; never ask them to paste credentials into chat. Poll `status` until `isLoggedIn` is true. The companion then protects the reusable Solid session for this device user and restores it across chats, MCP process exits, application restarts, and computer restarts.
- `load` uses payload `{ "document": "learner" }`, `{ "document": "educator" }`, or `{ "document": "classroom" }`. `save` uses the same `document`, the complete updated `value`, and the prior load `digest` as `expectedDigest` so a concurrent change cannot be overwritten silently.
- `identity`, `sign`, and `verify` use a local owner-controlled Ed25519 key for classroom envelopes. The private key is never exported or stored on the public server.
- `forget_solid_authorization` removes the reusable authorization from this device. Call it only after the user explicitly asks ASFAI to forget or revoke this Pod connection. Never call it when a lesson, chat, MCP process, application, or computer session ends. The user may also revoke ASFAI through their Pod provider; revoked or otherwise invalid grants require one new approval if the user later reconnects.

Pod documents are stored at `<pod-root>/asfai/learner.json`, `<pod-root>/asfai/educator.json`, and `<pod-root>/asfai/classroom.json`. Local documents use the same names under the configured directory. Say that data is saved only when the tool returns `verified: true` after read-back.

The learner document may contain a top-level `artifacts` map. Evidence events link entries through `artifactIds`. Keep full transcript text inline only through the 8,192-byte UTF-8 cutoff; otherwise retain a summary of at most 2,000 characters and a provider/object reference. Binary artifact content stays outside `learner.json`.

For teacher/student exchange, use `asfai_evidence` to create an integrity-protected progress envelope, `asfai_personal_storage` to sign the exact envelope, and `asfai_resource` to queue or accept the signed envelope. Share only the scoped envelope the learner approved, never the full profile or raw conversation.
