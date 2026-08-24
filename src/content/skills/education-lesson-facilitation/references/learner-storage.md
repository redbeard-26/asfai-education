# Learner-owned storage procedure

The public ASFAI MCP transforms a supplied profile and returns a complete updated profile. It cannot directly reach browser IndexedDB, a host filesystem, or a learner's authenticated Solid session. The chat host must perform and verify the write.

## Capability check

Before the lesson begins, inspect available tools and identify which capability is real:

- `browser_indexeddb`: JavaScript can run on the ASFAI Education origin and use IndexedDB;
- `local_filesystem`: the host can read, atomically replace, and reread a learner-approved file;
- `authenticated_solid_fetch`: the host has a logged-in Solid session and fetch bound to that session.

Call `get_learner_storage_instructions` with the target and confirmed capabilities. Do not offer an unavailable target as though it will work.

## IndexedDB

IndexedDB is origin-bound. A generic chat or remote MCP process cannot write the ASFAI Education database.

1. Open database `asfai-education` at version `1` from the ASFAI Education browser origin.
2. In `onupgradeneeded`, create object store `learner-profile` if absent.
3. Read key `current` before calling personalized tools. If absent, begin without `learnerProfile`.
4. After a tool returns an updated profile, start a `readwrite` transaction and put the complete object at key `current`.
5. Wait for the transaction's `complete` event. A successful request event alone does not prove the transaction committed.
6. Open a new `readonly` transaction, read `current`, and compare `learnerId`, `schemaVersion`, `updatedAt`, and the evidence, claim, run, and report counts.

If browser execution on the correct origin is unavailable, use a local JSON file or authenticated Pod instead.

## Local JSON file

1. Use a learner-approved persistent path, normally `asfai/learner.json`.
2. Read and parse it before calling personalized tools. If it does not exist, omit `learnerProfile` on the first call.
3. Write the complete returned profile to a temporary file in the same directory.
4. Atomically replace `learner.json` with the temporary file.
5. Reread and verify the identity, version, update time, and collection counts.

If the host cannot write files, offer the returned profile as a downloadable JSON file and say saving is pending.

## PrivateDataPod or another Solid Pod

1. Obtain the Pod root and OIDC issuer. Start Solid OIDC in a browser or connector that can retain the learner's session. Never request credentials or tokens in chat.
2. Confirm the session is logged in and provides an authenticated fetch. A WebID alone does not grant storage access.
3. Resolve the resource to `<pod-root>/asfai/learner.json`.
4. Read it with authenticated fetch. A `404` means it can be initialized. A `401` or `403` means authorization is missing or expired; reconnect instead of writing anonymously.
5. Create `<pod-root>/asfai/` with the authenticated Solid client if the container is absent.
6. Write the complete profile as `application/json`. Use the prior ETag with `If-Match` when exposed. On `412 Precondition Failed`, reload and reconcile; never silently discard either version.
7. Read the resource back with authenticated fetch and verify the identity, version, update time, and collection counts.

Do not pass passwords, access tokens, refresh tokens, DPoP keys, or session cookies to any ASFAI MCP tool. If the chat host lacks authenticated Solid fetch, explain that it cannot save to the Pod yet and offer another target.

## Confirmation

Say progress was saved only after write and read-back verification. On failure, preserve the returned profile in the conversation or as a downloadable file and state which step remains incomplete.
