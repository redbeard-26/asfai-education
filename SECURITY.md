# Security and Student Privacy

ASFAI Education operates an early public service, but it is not a managed learner-record system. Do not include real student data, secrets, credentials, private assessment content, or private learner endpoints in issues, pull requests, examples, or test fixtures.

The production artifact relay requires `ASFAI_ARTIFACT_LAUNCH_SECRET` with at least 32 random characters. Never expose it through `NEXT_PUBLIC_*`, lesson manifests, MCP tool arguments, logs, or client code. Rotate it after suspected disclosure; outstanding artifact launches will become invalid.

The current relay is process-local, accepts at most 128 KB, uses opaque one-hour capabilities, and deletes content after one successful claim. Do not use it for raw conversations, direct identifiers, media, or high-stakes assessment. A shared deployment must replace it with a TTL-backed store and preserve single-consumption semantics.

## Reporting a vulnerability

If GitHub private vulnerability reporting is enabled for the repository, use the repository's **Security → Report a vulnerability** workflow. Do not disclose an unpatched vulnerability in a public issue. If private reporting is unavailable, contact a repository maintainer through their public GitHub profile and ask for a private reporting channel without including exploit details in the first message.

## Baseline requirements for implementations

An implementation based on these documents should include:

- data minimization and a documented educational purpose;
- pseudonymous identifiers in evidence and analytics stores;
- separation of identity, raw conversation, evidence, and derived learner state;
- encryption in transit and at rest;
- least-privilege access and auditable administrative actions;
- retention, export, correction, and deletion procedures;
- tenant and school-boundary isolation;
- versioned AI prompts, models, rubrics, and decision policies;
- educator review and appeal for consequential AI judgments;
- defenses against prompt injection in student artifacts and imported content;
- age-appropriate interfaces and accessibility review;
- incident-response and breach-notification procedures.

Deployers are responsible for determining which laws and contracts apply, including FERPA, COPPA where relevant, state student-privacy laws, school agreements, and international requirements. Repository documentation is not legal advice.
