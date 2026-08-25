# Lessons and artifacts

ASFAI lessons are public, immutable plans that coordinate objectives, activities, artifacts, assessment methods, and report rules. Learner progress is not stored in a lesson definition or in the public lesson catalog.

## Four records with different owners

| Record | Purpose | Default owner |
|---|---|---|
| `LessonDefinition` | Public versioned plan | ASFAI lesson catalog |
| `LessonAssignment` | Teacher configuration and sharing scope | Teacher local store or Pod |
| `LessonRun` | One learner's activity state and evidence references | Learner local store or Pod |
| `LessonReport` | Lesson-scoped projection of evidence and claims | Learner until explicitly shared |

The learner-profile schema is `0.2`. Existing `0.1` profiles are upgraded without changing the learner identifier or existing evidence and claims. Lesson runs and reports are added as separate collections.

Small textual representations of student artifacts may be retained in `learner.json`: inline transcript text is capped at 8 KiB of UTF-8 text per artifact. The artifact stays in the top-level learner-owned `artifacts` map and evidence events refer to it by ID. Larger text uses an inline summary of at most 2,000 characters plus its private provider/object reference. Binary files and large telemetry bundles stay outside `learner.json`; images, audio, video, and documents must not be base64-encoded into the profile. The current browser and Solid stores continue to serialize the portable snapshot in one resource; separate blob stores are the next storage-adapter increment.

## MCP workflow

Teacher-facing tools prepare an authoring workflow, validate and review a complete package, prepare immutable publication metadata, and create a portable assignment. The anonymous public MCP deliberately cannot publish arbitrary executable HTML. Final publication requires an authenticated publisher.

Student-facing tools search and load lessons, start a learner-owned run, return the next activity, launch games, normalize their results, record evidence and claims, and generate a report. Tools that transform private state return the complete updated profile and persistence instructions; the server retains neither the profile nor the report.

The installable skills `education-lesson-authoring` and `education-lesson-facilitation` tell an AI chat host how to orchestrate these tools.

All orchestration stays out of learner-facing dialogue. Student instructions say what is being learned or done and ask the real question; they do not announce skills, workflows, MCP calls, rubrics, evidence records, assessment claims, telemetry, or other system machinery. The authoring, assessment-preparation, and next-step tools return this delivery rule explicitly so an AI host does not accidentally expose internal directions.

## Artifact launch and result relay

The bundled Block Algebra games use a short-lived capability:

1. `asfai_lesson` action `create_artifact_launch` returns a game URL, launch ID, token, and expiry.
2. The game posts a minimized summary to `/education/api/artifact-results`.
3. `asfai_lesson` action `claim_artifact_result` consumes the summary once and normalizes it.
4. The chat host records justified observations through `asfai_evidence` action `record_lesson` and saves the returned profile.

The launch contains no learner identifier. The relay accepts at most 128 KB, expires launches after at most one hour, deletes result content after a successful claim, and requires `ASFAI_ARTIFACT_LAUNCH_SECRET` in production.

The first relay implementation is process-local and suitable for the current single-container pilot. It is not durable across restarts and must be replaced with a TTL-backed shared store before horizontal scaling.

## Artifact publication

Curated artifacts can be bundled in `public/artifacts` and copied into the standalone Docker image. Teacher-created artifacts should ultimately use immutable S3 keys and a cookie-free CloudFront origin. Publishing requires educator authentication, content and archive validation, malware/static scanning, provenance and licensing checks, content-security policy generation, and an explicit confirmation step.

Public lesson definitions may refer to Marble objective IDs or define scoped ASFAI objectives with sourced alignment records. They never copy the Marble taxonomy. The existing upstream GitHub fetch and 24-hour runtime cache remain the canonical public graph source.
