# Personal storage MCP companion

The public ASFAI Education MCP is deliberately unable to read or write private learner and teacher data. The **ASFAI Learning** plugin packages the private `asfai-personal-storage` MCP alongside the public AWS MCP.

## Learner installation

The intended learner flow is:

1. Install **ASFAI Learning** from the plugin directory.
2. Start a chat and say, “Connect my private Pod,” or begin learning with storage on this device.
3. If using a Pod, approve access on the Pod provider page and return to chat.

The learner does not clone a repository, install Node packages, edit MCP settings, or choose filesystem paths. The plugin includes the compiled runtime and a compact skill that guides the assistant. The public MCP continues to supply specialized lesson and assessment guidance only when needed.

Repository developers can still run `npm run personal-storage:mcp` directly. This is a development fallback, not a learner installation procedure.

The plugin exposes one private stdio MCP tool, `asfai_personal_storage`. By default, private local state goes under `.asfai-personal-storage` in the current user's profile; `ASFAI_PERSONAL_DATA_DIR` may select a different approved local root for managed deployments.

## Solid authorization

Call `connect_solid` with only:

```json
{
  "podRoot": "https://albertawhitecarey.privatedatapod.com/",
  "oidcIssuer": "https://privatedatapod.com/"
}
```

The companion starts a loopback callback on `127.0.0.1:18765` and returns the provider authorization URL. Open that URL in the user's browser. Authentication and consent happen entirely on the provider page. The user must never paste a password, cookie, token, refresh token, client secret, or DPoP key into chat.

Authorization remains usable while the companion process and provider session are valid. Restarting the companion requires a new OIDC round trip, but a still-active provider session can usually complete it without another password prompt. The companion intentionally does not persist refresh tokens to disk.

After `status` reports `isLoggedIn: true`, use `load` and `save` with document `learner`, `educator`, or `classroom`. `save` performs a write and independent read-back. Pass the digest returned by the prior `load` as `expectedDigest`; a conflict fails instead of silently overwriting newer data.

## Local fallback and classroom identity

`configure_local` uses atomic, permission-restricted JSON files under the selected root. This mode needs no browser and preserves the same portable schemas.

`identity` creates an owner-controlled Ed25519 key under `asfai/identity/`. `sign` never exports the private key. Signed progress envelopes can be queued in a learner outbox and accepted in a teacher inbox only after the public MCP verifies envelope integrity and the classroom reducer verifies signature, recipient, and replay status.

The ASFAI Education website is not a coordinator for this process. It is only an optional browser client and OIDC test surface.
