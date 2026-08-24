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

`asfai_evidence` action `export_progress` creates a report envelope from the assignment's share policy. Action `import_progress` validates the schema and content digest. The digest detects accidental or untrusted modification; it is not an identity signature.

For authenticated offline exchange, action `prepare_progress_signature` returns the exact canonical message that an owner-side Ed25519 key must sign. The private key never enters an MCP argument. Action `verify_signed_progress` validates the envelope, detached signature, public key type, and signer-key fingerprint. Trusting that fingerprint as a particular teacher or learner still requires an authenticated classroom directory or an out-of-band key check; signature validity alone does not establish a real-world identity. An authenticated classroom transport may supply the same binding.

Teacher and peer feedback remains attributed evidence. Importing feedback does not overwrite prior evidence, claims, or objective states. A later assessment may supersede a prior claim while retaining the full history.

Raw conversations, raw game telemetry, and student-created artifacts are excluded by default. They are included only when the assignment allows them and the learner confirms that sharing scope.
