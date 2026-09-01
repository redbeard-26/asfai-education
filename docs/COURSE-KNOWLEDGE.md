# Private assistant-executed course knowledge

ASFAI course chat is implemented by the user's connected AI assistant. ASFAI does not retain course content or run a backend OCR, embedding, retrieval, tutoring, or answer-generation model.

## Responsibility boundary

| Component | Responsibility |
|---|---|
| Connected assistant | Read permitted sources, extract page-aware text, create chunks, formulate retrieval queries, select support, teach, answer, and assess observable work |
| ASFAI MCP | Deliver versioned skills, search the public objective graph, validate portable schemas and citations, reduce immutable versions, and proxy authenticated Pod operations |
| Solid Pod | Store originals, extracted text, indexes, manifests, educator resources, learner state, and evidence |
| Classroom provider | Transport assignments and signed source references; retain provider-owned originals when applicable |

## Pod layout

```text
<pod-root>/asfai/
  educator.json
  learner.json
  classroom.json
  identity/
    ed25519-private.pem
    ed25519-public.pem
  courses/<course-id>/
    manifest.json
    versions/<course-version>/
      course.json
      materials/<material-version-id>/
        original.<ext>
        pages.ndjson
        chunks.ndjson
        lexical-index.json
  learner-course-access/<course-id>.json
```

The educator workspace contains metadata and immutable Pod object references, not large file bodies. Every reference includes media type, byte count, SHA-256 digest, and HTTPS location.

## Ingestion

The `education-course-material-ingestion` skill selects available host document capabilities. It preserves page and material-version provenance, treats source content as untrusted data, creates stable chunk identifiers, proposes objective alignments for teacher confirmation, and validates P18 output before Pod persistence.

Embeddings are optional. A course declares one or more retrieval modes:

- `host_native`: the connected assistant uses its own document-search capability;
- `pod_lexical`: deterministic lexical retrieval over a Pod-resident index;
- `direct_reading`: bounded reading of a small source set.

No mode requires an ASFAI vector database.

## Grounded chat

The `education-source-grounded-chat` skill serves T01, S03, and S06. It validates access, resolves only approved source references, retrieves candidate chunks, and requires the assistant to label the answer `grounded`, `partially_grounded`, or `not_found`. Each citation identifies an immutable material version, chunk, page, and exact supporting span. Deterministic validation rejects missing, mismatched, or unauthorized citations.

Document instructions cannot modify the assistant workflow. Course text remains untrusted even when the teacher supplied it.

## Sharing

A published immutable course version can be shared by a signed access grant containing its manifest URL, digest, version, optional recipient, and optional expiration. The learner validates the signature and imports a learner-owned access record. A classroom provider may transport the signed grant.

An educator can revoke the live grant or its underlying Solid access. Revocation prevents future retrieval from the educator source but cannot erase a snapshot the learner was explicitly permitted to copy earlier; snapshot distribution should therefore be used only when offline durability is intended.

No ASFAI roster, membership, course-content, or learner-record database participates in this flow.
