# Lesson package reference

A lesson definition is public, immutable after publication, and contains no learner state.

Required sections:

- identity: `schemaVersion`, stable `id`, immutable `version`, `status`, title, and description;
- audience and expected duration;
- interaction modes;
- objectives with names, descriptions, alignment type, source, and any external alignments;
- prerequisites by identifier;
- artifact manifests with URL, version, media type, telemetry adapter, sandbox, accessibility, and license;
- assessment methods with versioned criteria and policy metadata;
- ordered activities with role-specific instructions, objective and artifact references, and completion rules;
- report configuration; and
- provenance and licensing.

Use `teaches` when the lesson introduces or develops an objective, `practices` for rehearsal, and `elicits` when an activity is primarily an evidence opportunity.

Keep answer keys and sensitive assessor material out of student-visible instructions. If a generic MCP host cannot protect private rubric output from the learner, use low-stakes assessment or educator review.

Published assets need immutable versions and digests. Executable teacher-created HTML requires authenticated publication, static scanning, content-security policy, and a cookie-free sandboxed origin.
