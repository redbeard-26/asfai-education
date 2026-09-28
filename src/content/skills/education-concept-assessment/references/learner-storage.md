# Learner-owned storage procedure

The authenticated ASFAI Learning connector can load and save the portable profile through `asfai_storage`. Call `status` first. A connected Solid Pod is required for persistence through the connector. If the learner uses Google Drive instead, follow the Google Drive procedure below with the assistant's own Drive connector. With neither, continue without persistence or return portable JSON. Load before assessment and save the complete update with the prior digest as `expectedDigest`. Claim success only when the tool returns `verified:true`.

Use the host-side procedures below only when the remote private-storage actions are genuinely unavailable. They are compatibility fallbacks, not prerequisites for the normal MCP workflow.

## Capability check

When using a host-side fallback, inspect which capability is real:

- `browser_indexeddb`: JavaScript can run on the ASFAI Education origin and use IndexedDB;
- `local_filesystem`: the host can read, atomically replace, and reread a learner-approved file;
- `authenticated_solid_fetch`: the host has a logged-in Solid session and fetch bound to that session;
- `host_google_drive`: the assistant has its own Google Drive connector that can create, read, and update files in the learner's My Drive.

Call `asfai_storage` action `instructions` with `owner: "learner"`, the target, and confirmed capabilities. Do not offer an unavailable target as though it will work. Do not prefer these procedures over a working `asfai_storage` private save.

## IndexedDB

IndexedDB is origin-bound. A generic chat or remote MCP process cannot write the ASFAI Education database.

1. Open database `asfai-education` at version `1` from the ASFAI Education browser origin.
2. In `onupgradeneeded`, create object store `learner-profile` if absent.
3. Read key `current` before calling personalized tools. If absent, begin without `learnerProfile`.
4. After a tool returns an updated profile, start a `readwrite` transaction and put the complete object at key `current`.
5. Wait for the transaction's `complete` event. A successful request event alone does not prove the transaction committed.
6. Open a new `readonly` transaction, read `current`, and call `asfai_storage` action `verify` with the expected returned profile and actual read-back. Confirm that `verified` is true.

If browser execution on the correct origin is unavailable, use a local JSON file, an authenticated Pod, or Google Drive instead.

## Local JSON file

1. Use a learner-approved persistent path, normally `asfai/learner.json`.
2. Read and parse it before calling personalized tools. If it does not exist, omit `learnerProfile` on the first call.
3. Write the complete returned profile to a temporary file in the same directory.
4. Atomically replace `learner.json` with the temporary file.
5. Reread it and call `asfai_storage` action `verify` with the expected and actual profiles.

If the host cannot write files, offer the returned profile as a downloadable JSON file and say saving is pending.

## PrivateDataPod or another Solid Pod

1. Obtain the Pod root and OIDC issuer. Start Solid OIDC in a browser or connector that can retain the learner's session. Never request credentials or tokens in chat.
2. Confirm the session is logged in and provides an authenticated fetch. A WebID alone does not grant storage access.
3. Resolve the resource to `<pod-root>/asfai/learner.json`.
4. Read it with authenticated fetch. A `404` means it can be initialized. A `401` or `403` means authorization is missing or expired; reconnect instead of writing anonymously.
5. Create `<pod-root>/asfai/` with the authenticated Solid client if the container is absent.
6. Write the complete profile as `application/json`. Use the prior ETag with `If-Match` when exposed. On `412 Precondition Failed`, reload and reconcile; never silently discard either version.
7. Read the resource back with authenticated fetch and call `asfai_storage` action `verify` with the expected and actual profiles.

Do not pass passwords, access tokens, refresh tokens, DPoP keys, or session cookies to any ASFAI MCP tool. If the chat host lacks authenticated Solid fetch, explain that it cannot save to the Pod yet and offer another target.

## Google Drive

Use this when the assistant has its own Google Drive connector and the learner chooses Drive. ASFAI never receives Drive credentials or file content.

1. Call `asfai_storage` action `instructions` with `owner: "learner"` and `target: { "mode": "google_drive" }` (add `"location": "<ASFAI folder ID>"` once known).
2. Find the learner's `ASFAI` folder in My Drive, marked by `asfai-store.json`. With the learner's agreement, create it if absent. Never use a shared drive.
3. Read and parse `ASFAI/learner.json`. If it does not exist, begin without `learnerProfile`. Note the file's modified time.
4. Before saving, check the modified time again. If it changed, reload and reconcile instead of overwriting.
5. Replace the file content with the complete returned profile as a plain `application/json` file. Do not convert it to a Google Doc.
6. Read it back and confirm the parsed JSON is identical to what was written. Do not send the profile to ASFAI to compare.

If the assistant has no Drive connector, explain that it cannot save to Drive yet and offer another target.

## Confirmation

Say progress was saved only after write and read-back verification. On failure, preserve the returned profile in the conversation or as a downloadable file and state which step remains incomplete.
