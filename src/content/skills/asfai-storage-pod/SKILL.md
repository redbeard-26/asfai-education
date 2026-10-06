---
name: asfai-storage-pod
description: The only instructions for saving ASFAI learner, educator, classroom, course, and writing records in a Solid Pod such as PrivateDataPod — connecting, loading, saving, files, references, signing, and sharing.
---

# Saving to a Solid Pod

This is the single source of instructions for saving ASFAI data in a Solid Pod. Other ASFAI guidance only says to save "in the user's store"; when that store is a Pod, follow this resource.

## When to use

Call `asfai_storage` action `status`. If it reports `mode:"solid_pod"` with `isLoggedIn:true`, the user has a Pod and you can load immediately; do not start another authorization. Use the Pod when the user asks for it ("connect my private Pod", "use my PrivateDataPod") or has already chosen it. If the user also has another ASFAI store, ask once which one to use and keep using it; never split one person's records across stores.

If `status` reports `not_connected` and the user wants a Pod, connect one. Otherwise continue without saving, or use the store the user chooses.

## Connect

Call `asfai_storage` action `connect_pod` with only the Pod root and OIDC issuer. For PrivateDataPod:

```json
{ "action": "connect_pod", "payload": { "podRoot": "https://<name>.privatedatapod.com/", "oidcIssuer": "https://privatedatapod.com/" } }
```

Show the returned URL once as **Connect private storage**, then call `status` again after the user approves. Authentication happens only on the provider's page. Never ask for or accept a password, cookie, authorization code, access token, refresh token, client secret, or DPoP key.

The encrypted grant stays with the user's ASFAI connector across chats and, when the host shares the connector authorization, across devices. It ends only when the user asks to forget it (`forget_pod_authorization`), revokes ASFAI at the Pod provider, or revokes the ASFAI connector. Never call `forget_pod_authorization` as cleanup.

## Storage target

When an ASFAI tool asks for a `storage` target (for example `record_learning`), pass `{ "mode": "solid_pod", "location": "<pod root>" }`.

## Layout

```text
<pod-root>/asfai/
  learner.json  educator.json  classroom.json
  identity/ed25519-private.pem  identity/ed25519-public.pem
  courses/<course-id>/manifest.json
  courses/<course-id>/versions/<course-version>/course.json
  courses/<course-id>/versions/<course-version>/materials/<material-version-id>/original.<ext> | pages.ndjson | chunks.ndjson | lexical-index.json
  learner-course-access/<course-id>.json
  writing/<assignment-id>/essay-v<N>.txt | feedback-v<N>.json | revision-v<N>.json
```

## Records (learner, educator, classroom)

- Load with `asfai_storage` action `load` and payload `{ "document": "learner" }`, `"educator"`, or `"classroom"`. Keep the returned `digest`.
- Save the complete updated document with action `save`, the same `document`, `value`, and the prior `digest` as `expectedDigest`, so a concurrent change is never overwritten silently. On a conflict, reload and reconcile.
- Say it is saved only when `save` returns `verified:true` after read-back.

## Files

Use `put_object`, `get_object`, `head_object`, `list_objects`, and `delete_object` for course originals, extracted text, indexes, manifests, and writing drafts. Paths are relative to `<pod-root>/asfai/` and may contain only letters, digits, `.`, `_`, `-`, and `/`. Objects are limited to 50 MB; reads are bounded.

- `put_object`: `{ "path", "contentType", "text" }` or `base64` instead of `text`. Pass `expectedDigest` only when replacing a known object.
- Saved course material and essay drafts are immutable: never overwrite one; save a new version under a new name.
- Use `list_objects` with `containerPath` to find the next version number. A missing folder means the first version.
- Delete an object only after confirming nothing active refers to it.
- Say a file is saved only when `put_object` returns `verified:true`.

## References

Refer to a saved Pod file as:

```json
{ "storage": "solid_pod", "href": "<https URL of the object>", "mediaType": "<type>", "sha256": "<digest from put_object>", "bytes": 1234, "immutable": true }
```

In a learner `artifacts` entry, set `provenance.system` to `"asfai-pod"`, `provenance.externalId` to the object path, and `sha256` to the digest.

## Signing and sharing

- `identity` creates the owner's Ed25519 key in the Pod; `sign` signs an exact value without exporting the key; `verify_signature` checks a signature.
- Sign progress envelopes before sharing them, and sign course access grants from `asfai_resource` action `prepare_course_share` (the result says `signingRequired: true`).
- Course access for a learner is a signed grant plus Solid read access; revoke the grant or the Solid access to end it. A snapshot the learner was allowed to copy cannot be recalled.

## What ASFAI handles

`asfai_storage` performs Pod reads and writes for the user. Data passes through the ASFAI connector in memory and is not kept (`serverRetained: false`). This includes any student essay text saved to a Pod; the grading and revision tools themselves ignore essay text. The only lasting connector-side data is the encrypted Pod authorization.

## Direct clients with their own Solid session

A client that has its own logged-in Solid session (not the ASFAI connector) can write the learner profile itself. Call `asfai_storage` action `instructions` with `owner` and `target: { "mode": "solid_pod", "location": "<pod root>" }` for the exact location, then:

1. Confirm the session is logged in and gives an authenticated fetch. A WebID alone does not grant access.
2. Resolve `<pod-root>/asfai/learner.json` (or `educator-workspace.json` for an educator). Create `<pod-root>/asfai/` if absent.
3. Read the resource. `404` means start fresh; `401` or `403` means reconnect instead of writing.
4. Write the complete JSON as `application/json`, with `If-Match` and the prior ETag when available. On `412`, reload and reconcile.
5. Read it back and call `asfai_storage` action `verify` with the expected and actual JSON. Say it is saved only when `verified` is true.

Never send Solid tokens, passwords, DPoP keys, or cookies to any ASFAI tool.

## ASFAI web app

The ASFAI Education web app signs in to a Pod in the browser with Solid OIDC (`@inrupt/solid-client-authn-browser`); the user gives the Pod root and OIDC issuer and signs in on the provider's page, and ASFAI never sees the Pod password. The app keeps the learner profile at `<pod-root>/asfai/learner.json`. Hosted Solid sign-in for the connector also works from the temporary AWS origin before a custom education domain exists.
