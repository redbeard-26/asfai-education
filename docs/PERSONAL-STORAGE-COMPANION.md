# Private storage

ASFAI keeps no private education records. Learner, educator, classroom, course, and writing records are saved only in storage the user owns. The **ASFAI Learning** plugin uses one authenticated remote MCP connector for public learning workflows, private storage, and classroom exchange; it does not install a local companion or require the ASFAI Education website.

## Storage resources

Every instruction for saving lives in exactly one storage resource per kind of store. Nothing else in this repository describes how to save:

| Resource | File |
|---|---|
| `asfai-storage-pod` | [src/content/skills/asfai-storage-pod/SKILL.md](../src/content/skills/asfai-storage-pod/SKILL.md) |
| `asfai-storage-drive` | [src/content/skills/asfai-storage-drive/SKILL.md](../src/content/skills/asfai-storage-drive/SKILL.md) |
| `asfai-storage-local` | [src/content/skills/asfai-storage-local/SKILL.md](../src/content/skills/asfai-storage-local/SKILL.md) |

Assistants get a resource with `asfai_capability` action `get_skill`. Tools that return data to save include a `resource` pointer to the right one, and `asfai_storage` action `instructions` returns the location in the user's store plus that pointer. When the user's store is not known, the assistant asks where to save.

## Shared layout

All stores use the same logical names, so records can move between stores:

```text
learner.json  educator.json  classroom.json
courses/<course-id>/...
learner-course-access/<course-id>.json
writing/<assignment-id>/essay-v<N>.txt | feedback-v<N>.json | revision-v<N>.json
```

A store that cannot hold files keeps only the records. Saved course material and writing drafts are immutable; a new version gets a new name.

## Writing records

A student's essays and writing feedback are saved only in the student's own store, from the student's own chat, after the student agrees. A teacher cannot save into a student's store. The teacher approves the T30 grade and feedback first; the student then saves them during S17 Writing Feedback.

```text
writing/<assignment-id>/
  essay-v1.txt         the student's text, exactly as written
  feedback-v1.json     teacher-approved grade and feedback, with a reference to essay-v1
  essay-v2.txt         each revision is a new file; saved drafts are never overwritten
  revision-v2.json     revision check, with references to both drafts
```

Each essay version also gets an `artifacts` entry in `learner.json` that points to the saved file; the full text is kept inline only up to 8,192 bytes. The grading and revision tools ignore essay text.

## Security boundary

The connector uses OAuth 2.1 with PKCE and creates a pseudonymous connector tenant; no ASFAI account or email address is required. Reusable provider grants are encrypted with AES-256-GCM and isolated by connector tenant. This authorization material is the only durable connector-side private state. Provider credentials and raw private documents are not placed in tool descriptions or returned to the model.

A repository developer may run `npm run personal-storage:mcp` as a legacy local test harness; it is not packaged in the plugin.
