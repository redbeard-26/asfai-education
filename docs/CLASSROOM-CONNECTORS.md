# Classroom connectors

ASFAI treats a classroom system as a transport and roster context, not as the source of truth for learning mastery. The local plugin companion exposes one provider-neutral MCP tool, `asfai_classroom`. Each request includes a provider identifier; the first adapter uses `provider: "google"`. Future Canvas, Schoology, Moodle, or other adapters can implement the same normalized operations without adding more default MCP tools.

## Complete AI workflow

```text
configured classroom provider
          │ local OAuth
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
asfai_personal_storage verified save
          │ explicit preview + approval
          ▼
asfai_classroom export_work / return_evaluation
```

The public AWS MCP remains stateless. Classroom passwords, authorization codes, access and refresh tokens, OAuth client secrets, raw student submissions, and complete private profiles never go to it. The local companion keeps OAuth material only in memory; disconnecting or restarting it requires authorization again. Detailed evidence is saved to the learner's or educator's local JSON/Solid Pod document, not retained by the classroom bridge.

## Tool actions

| Action | Purpose | External mutation |
|---|---|---|
| `status` | Report provider configuration, connection, scopes, and limitations | No |
| `connect` | Start local browser OAuth with learner/teacher and read-only/write scope choices | Opens provider authorization |
| `disconnect` | Clear the provider session held by this companion process | Local session only |
| `list_courses` | Select a course | No |
| `list_learners` | Select a learner from a teacher-authorized course roster | No |
| `list_assignments` | Select an assignment | No |
| `import_work` | Normalize assignment and submission content with objective references | No |
| `create_assignment` | Create a draft or published assignment | Preview and explicit confirmation |
| `export_work` | Attach text, Drive files, or links and optionally turn work in | Preview and explicit confirmation |
| `return_evaluation` | Set draft/published grade and optionally return a submission | Preview and explicit confirmation |

The bridge does not decide mastery. The AI maps work to learning objectives, uses `asfai_evidence` to form evidence-backed observations and claims, and saves those records with `asfai_personal_storage`. A Classroom grade, completion flag, or turned-in state is never converted directly into mastery.

## Google configuration

The Google adapter uses a Desktop OAuth client and a loopback callback. The administrator enables the Google Classroom API and Google Drive API, configures the OAuth consent screen and permitted users, and supplies these environment variables to the local plugin host:

```text
ASFAI_GOOGLE_CLASSROOM_CLIENT_ID=<OAuth desktop client ID>
ASFAI_GOOGLE_CLASSROOM_CLIENT_SECRET=<OAuth desktop client secret>
ASFAI_CLASSROOM_OAUTH_PORT=18766            # optional
```

The adapter asks for the least access selected at connection time. Read-only import does not request write access. Drive attachment text is opt-in because reading arbitrary Drive files can require a broader restricted scope. Assignment creation and work/grade writes require writable Classroom scopes; creating an ASFAI text attachment also uses `drive.file`.

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
