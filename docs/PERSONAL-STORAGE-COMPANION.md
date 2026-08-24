# Personal storage MCP companion

The public ASFAI Education MCP is deliberately unable to read or write private learner and teacher data. A client that supports local MCP processes can add the private `asfai-personal-storage` companion alongside the public AWS MCP.

## Run it

Install repository dependencies, then run:

```text
npm run personal-storage:mcp
```

The process exposes one stdio MCP tool, `asfai_personal_storage`. Configure the MCP client to launch that command with this repository as its working directory. By default, private local state goes under `.asfai-personal-storage` in the current user's profile; `ASFAI_PERSONAL_DATA_DIR` may select a different approved local root.

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
