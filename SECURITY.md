# Security and Student Privacy

ASFAI Education is currently a design repository and does not operate a production service. Do not include real student data, secrets, credentials, private assessment content, or production endpoints in issues, pull requests, examples, or test fixtures.

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
