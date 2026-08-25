# Classroom connectors

ASFAI treats a classroom system as a transport and roster context, not as the source of truth for learning mastery. The single authenticated ASFAI Learning connector exposes one provider-neutral MCP tool, `asfai_classroom`. Each request includes a provider identifier; the first adapter uses `provider: "google"`. Future Canvas, Schoology, Moodle, or other adapters can implement the same normalized operations without adding more default MCP tools.

## Complete AI workflow

```text
configured classroom provider
          │ hosted OAuth
          ▼
  asfai_classroom import_work
          │ normalized work + provenance
          ▼
 asfai_graph objective mapping
          │
          ▼
 asfai_evidence assessment
          │ concise observations/claims
          ▼
 asfai_storage verified save
          │ explicit preview + approval
          ▼
asfai_classroom export_work / return_evaluation
```

Classroom passwords, authorization codes, access tokens, refresh tokens, OAuth client secrets, raw student submissions, and complete private profiles are never placed in tool arguments or model-visible results. The connector encrypts the reusable Google grant with AES-256-GCM and binds it to the pseudonymous connector tenant. It restores that grant across chats and devices whenever the host reuses the same installed connector authorization. It remains available until the user explicitly chooses `forget_authorization`, revokes ASFAI in their Google Account, or revokes the ASFAI connector. Detailed evidence is saved through `asfai_storage`: to the Solid Pod whenever connected, otherwise to the clearly identified connector-scoped fallback. When the original artifact remains in Classroom, the learner record may retain its provider reference and an inline transcript of at most 8 KiB; larger transcripts use a concise summary and reference instead.

## Tool actions

| Action | Purpose | External mutation |
|---|---|---|
| `status` | Restore and report provider configuration, connection, scopes, and limitations | No |
| `connect` | Reuse sufficient saved permission or start hosted browser OAuth for missing permission | Opens provider authorization only when needed |
| `disconnect` | Close a pending browser authorization without forgetting the saved grant | Pending connector state only |
| `forget_authorization` | Remove the reusable grant for this connector tenant after an explicit user request | Deletes protected authorization |
| `list_courses` | Select a course | No |
| `list_learners` | Select a learner from a teacher-authorized course roster | No |
| `list_assignments` | Select an assignment | No |
| `import_work` | Normalize assignment and submission content with objective references | No |
| `create_assignment` | Create a draft or published assignment and optionally generate/attach Google Docs or files as view, edit, or per-student-copy material | Preview and explicit confirmation |
| `export_work` | Attach text, Drive files, or links and optionally turn work in | Preview and explicit confirmation |
| `return_evaluation` | Set draft/published grade and optionally return a submission | Preview and explicit confirmation |

The bridge does not decide mastery. The AI maps work to learning objectives, uses `asfai_evidence` to form evidence-backed observations and claims, and saves those records with `asfai_storage`. A Classroom grade, completion flag, or turned-in state is never converted directly into mastery.

## Google configuration

The Google adapter uses a Web OAuth client and the connector's hosted callback at `<ASFAI_SITE_ORIGIN>/education/oauth/google/callback`. The AWS deployment supplies the client ID and secret as server-side environment variables. Every user grants access to their own Google account; the client credentials are never distributed in the plugin.

Set `ASFAI_GOOGLE_CLASSROOM_CLIENT_ID` and `ASFAI_GOOGLE_CLASSROOM_CLIENT_SECRET` in the education service's protected environment. A checked-in or user-supplied credential file is not part of the plugin installation.

The adapter defaults to read-only access. Drive attachment text is opt-in because reading arbitrary Drive files can require a broader restricted scope. Assignment creation and work/grade writes require a new consent for writable Classroom scopes; creating an ASFAI text attachment also uses `drive.file`. A sufficient saved grant is reused without opening another consent page.

Google restricts attachment access, submission attachment changes, and grade passback to coursework associated with the same Google Developer project. When an imported third-party assignment does not meet that condition, ASFAI retains the private evidence and falls back to a teacher-readable report or manual attachment. The Classroom API used here does not expose private feedback comments, so detailed objective-level feedback remains owner-side while Classroom receives only the explicitly approved grade and state.

## Provider adapter contract

A future adapter implements the operations in `src/lib/classroom-connectors/contract.ts` and returns normalized course, assignment, submission, attachment, and mutation-preview data. Provider-specific IDs and URLs are preserved as provenance. Adapters must:

- keep credentials out of tool arguments and results;
- default to least privilege and make expanded content access explicit;
- return mutation previews without changing external state when `confirmed:false`;
- reject unsupported mutations rather than silently approximating them;
- minimize imported student content and declare whether any server retains it; and
- preserve objective IDs as context without asserting an assessment outcome.

The upstream Marble taxonomy continues to be fetched from GitHub and cached at runtime. Classroom integration does not copy or fork those taxonomy files.
