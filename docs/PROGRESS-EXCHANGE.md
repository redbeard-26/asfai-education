# Lesson progress exchange

Local browser storage does not synchronize students and teachers by itself. ASFAI therefore uses a transport-neutral `ProgressEnvelope` for deliberate, lesson-scoped sharing.

An envelope identifies an assignment, immutable lesson version, assignment-specific participant pseudonym, sender and recipient roles, consent scope, payload, creation time, and SHA-256 integrity digest. It must not contain the learner's global private profile identifier unless the learner explicitly chooses broader disclosure.

Initial message kinds are:

- `assignment`
- `progress-update`
- `submission`
- `feedback`
- `report`
- `receipt`

`export_progress_update` creates a report envelope from the assignment's share policy. `import_progress_update` validates the schema and content digest. The digest detects accidental or untrusted modification; it is not an identity signature. Authenticating the sender requires a later signing layer or an authenticated classroom transport.

Teacher and peer feedback remains attributed evidence. Importing feedback does not overwrite prior evidence, claims, or objective states. A later assessment may supersede a prior claim while retaining the full history.

Raw conversations, raw game telemetry, and student-created artifacts are excluded by default. They are included only when the assignment allows them and the learner confirms that sharing scope.
