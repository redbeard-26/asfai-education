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
    "podRoot": "https://albertawhitecarey.privatedatapod.com/",
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

## Security boundary

The connector uses OAuth 2.1 with PKCE. Reusable provider grants are encrypted with AES-256-GCM and isolated by pseudonymous connector tenant. This authorization material is the only durable connector-side private state. Provider credentials and raw private documents are not placed in tool descriptions or returned to the model. Owner signing keys are stored in the connected Pod rather than an ASFAI tenant data directory.
