---
name: asfai-personal-storage
description: Connect, read, or write PrivateDataPod and other Solid Pods directly from ASFAI chat through the authenticated remote connector, with verified connector-scoped fallback storage when no Pod is available.
---

# ASFAI personal storage

Use `asfai_storage` on the authenticated ASFAI Learning connector when the conversation must connect, load, or save private learner, educator, or classroom state. It is already the Solid bridge; do not look for another Pod connector or local companion. Provider credentials are accepted only by the provider's hosted authorization page, never as tool arguments or model-visible results.

If the user says "connect my private Pod," "use my PrivateDataPod," or equivalent, call `asfai_storage` with action `status` immediately and continue with `connect_pod` when needed. Treat this as an action request, not a request for architectural advice.

The storage gateway supports:

- `status` reports `solid_pod` or `asfai_cloud_fallback` without exposing credentials. It silently restores a valid Pod grant. If it returns `isLoggedIn:true`, continue directly to `load`.
- `connect_pod` uses payload `{ "podRoot": "https://<name>.privatedatapod.com/", "oidcIssuer": "https://privatedatapod.com/" }` for PrivateDataPod. Show the returned link once and poll `status` after approval. The encrypted grant follows the authenticated connector across chats and supported devices until explicit removal or provider revocation.
- `load` uses payload `{ "document": "learner" }`, `{ "document": "educator" }`, or `{ "document": "classroom" }`. `save` uses the same `document`, the complete updated `value`, and the prior load `digest` as `expectedDigest` so a concurrent change cannot be overwritten silently.
- `identity`, `sign`, and `verify_signature` use a connector-scoped Ed25519 key for classroom envelopes. The private key is never exported.
- `forget_pod_authorization` removes the reusable Pod grant from this connector. Call it only after an explicit user request; never as session cleanup.

Pod documents are stored at `<pod-root>/asfai/learner.json`, `<pod-root>/asfai/educator.json`, and `<pod-root>/asfai/classroom.json`. The Pod is primary whenever connected. When the tool reports `asfai_cloud_fallback`, describe it accurately rather than calling it a Pod or device-local save. Say that data is saved only when the tool returns `verified:true` after read-back.

The learner document may contain a top-level `artifacts` map. Evidence events link entries through `artifactIds`. Keep full transcript text inline only through the 8,192-byte UTF-8 cutoff; otherwise retain a summary of at most 2,000 characters and a provider/object reference. Binary artifact content stays outside `learner.json`.

For teacher/student exchange, use `asfai_evidence` to create an integrity-protected progress envelope, `asfai_storage` to sign the exact envelope, and `asfai_resource` to queue or accept the signed envelope. Share only the scoped envelope the learner approved, never the full profile or raw conversation.
