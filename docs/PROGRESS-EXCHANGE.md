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

The authenticated ASFAI Learning connector supplies the owner-scoped execution layer:

1. Each owner calls `identity` once and shares only the public key/fingerprint through the approved class channel.
2. The sender creates an integrity-protected envelope with `asfai_evidence`, signs the exact envelope with `asfai_storage`, and queues it with `asfai_resource` action `queue_exchange`.
3. The sender saves the complete classroom document locally or in their Pod with digest-based conflict protection and read-back verification.
4. The recipient imports the portable signed envelope with action `accept_exchange`. Signature, integrity, intended recipient role, signer fingerprint, and replay receipt are checked before it enters the inbox.
5. The recipient saves their own updated classroom document. Raw conversations and full learner profiles are not transported.

This is authenticated, store-and-forward exchange rather than a central student database. A school transport, LMS, email attachment, or direct file exchange may carry the signed envelope without becoming the source of truth.

Teacher and peer feedback remains attributed evidence. Importing feedback does not overwrite prior evidence, claims, or objective states. A later assessment may supersede a prior claim while retaining the full history.

Raw conversations, raw game telemetry, and student-created artifacts are excluded by default. They are included only when the assignment allows them and the learner confirms that sharing scope.
