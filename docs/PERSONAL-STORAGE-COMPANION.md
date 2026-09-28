# Private storage gateway

The **ASFAI Learning** plugin uses one authenticated remote MCP connector for public learning workflows, private storage, and classroom exchange. It does not install a local companion or require the ASFAI Education website.

## Learner installation

The intended flow is:

1. Install or update **ASFAI Learning** from the plugin directory.
2. Approve the ASFAI connector once. This creates a pseudonymous connector tenant; no ASFAI account or email address is required.
3. Say, “Connect my private Pod,” and approve access on the Pod provider page.
4. Continue in chat. The connector restores the saved Pod grant until the user explicitly revokes or forgets it.

The learner does not clone a repository, install Node packages, edit MCP settings, select a filesystem path, or keep a webpage open. A repository developer may still run `npm run personal-storage:mcp` as a legacy local test harness; it is not packaged in the plugin.

## Pod-only remote storage

Call `asfai_storage` with action `connect_pod` and only the Pod root and OIDC issuer, for example:

```json
{
  "action": "connect_pod",
  "payload": {
    "podRoot": "https://student.name.privatedatapod.com/",
    "oidcIssuer": "https://privatedatapod.com/"
  }
}
```

The connector returns a hosted provider authorization URL when consent is needed. Authentication occurs entirely on the provider page. Never paste a password, cookie, authorization code, token, client secret, or DPoP key into chat.

After `status` reports a connected Pod, use `load` and `save` with document `learner`, `educator`, or `classroom`. Do not reconnect at the start of a chat or lesson. `save` performs conflict checking and independent read-back. Pass the digest returned by the prior `load` as `expectedDigest` when updating an existing document.

The authorization persists across chats and, when the host shares the installed connector authorization, across the user's devices. It ends only when the user calls `forget_pod_authorization`, revokes ASFAI at the Pod provider, or revokes the ASFAI connector itself. Assistants must never call the forget action as cleanup.

## Fallback and identity

If no Pod is available, `status` returns `mode: "not_connected"`. Private `load`, `save`, object, identity, and signing actions stop without creating an ASFAI-hosted record. The assistant may continue without persistence or return portable JSON while the user connects a Pod.

Large course files and derived text use the object actions `put_object`, `get_object`, `head_object`, `list_objects`, and `delete_object`. Paths are confined beneath the Pod's `asfai/` container, reads are bounded, and writes and deletes support digest conflict checks.

`identity` creates an owner-scoped Ed25519 key. `sign` never exports the private key. Signed progress envelopes can move through a classroom system or another transport while `asfai_evidence` verifies the envelope, recipient, fingerprint, and replay state.

## Essays and writing feedback

A student's essays and writing feedback are saved only in the student's own Pod, from the student's own chat, after the student agrees. A teacher's connector cannot write to a student's Pod. The teacher approves the T30 grade and feedback first; the student then saves it during S17 Writing Feedback.

```text
<pod-root>/asfai/writing/<assignment-id>/
  essay-v1.txt         the student's text, exactly as written
  feedback-v1.json     teacher-approved grade and feedback, with essayPath and essayDigest
  essay-v2.txt         each revision is a new file; saved drafts are never overwritten
  revision-v2.json     revision check, with previous and revised essay paths and digests
```

Files are written with `put_object` and confirmed by read-back. Each essay version also gets an `artifacts` entry in `learner.json` that points to its object path and digest; the full text is kept inline only up to 8,192 bytes. The step-by-step instructions are in the `asfai-personal-storage` skill. These storage calls are the only ASFAI calls that carry essay text: the grading and revision tools ignore it, and the storage gateway writes it to the Pod without keeping a copy.

## Security boundary

The connector uses OAuth 2.1 with PKCE. Reusable provider grants are encrypted with AES-256-GCM and isolated by pseudonymous connector tenant. This authorization material is the only durable connector-side private state. Provider credentials and raw private documents are not placed in tool descriptions or returned to the model. Owner signing keys are stored in the connected Pod rather than an ASFAI tenant data directory.
