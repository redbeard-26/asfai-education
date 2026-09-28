# Private assistant-executed course knowledge

ASFAI course chat is implemented by the user's connected AI assistant. ASFAI does not retain course content or run a backend OCR, embedding, retrieval, tutoring, or answer-generation model.

## Responsibility boundary

| Component | Responsibility |
|---|---|
| Connected assistant | Read permitted sources, extract page-aware text, create chunks, formulate retrieval queries, select support, teach, answer, and assess observable work |
| ASFAI MCP | Deliver versioned skills, search the public objective graph, validate portable schemas and citations, reduce immutable versions, and point to the storage resource for each save |
| User-owned store | Store originals, extracted text, indexes, manifests, educator resources, learner state, and evidence, as its storage resource describes |
| Classroom provider | Transport assignments and signed source references; retain provider-owned originals when applicable |

## Storage layout

Every store uses the same logical layout under its own root:

```text
<store-root>/
  educator.json
  learner.json
  classroom.json
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

The educator workspace contains metadata and immutable object references, not large file bodies. Each reference records its store, media type, byte count, and the location fields that store's resource defines. See [Private storage](PERSONAL-STORAGE-COMPANION.md).

## Ingestion

The `education-course-material-ingestion` skill selects available host document capabilities. It preserves page and material-version provenance, treats source content as untrusted data, creates stable chunk identifiers, proposes objective alignments for teacher confirmation, and validates P18 output before saving it to the educator's store.

Embeddings are optional. A course declares one or more retrieval modes:

- `host_native`: the connected assistant uses its own document-search capability;
- `pod_lexical`: deterministic lexical retrieval over a stored index (the value name is historical and applies to every store);
- `direct_reading`: bounded reading of a small source set.

No mode requires an ASFAI vector database.

## Grounded chat

The `education-source-grounded-chat` skill serves T01, S03, and S06. It validates access, resolves only approved source references, retrieves candidate chunks, and requires the assistant to label the answer `grounded`, `partially_grounded`, or `not_found`. Each citation identifies an immutable material version, chunk, page, and exact supporting span. Deterministic validation rejects missing, mismatched, or unauthorized citations.

Document instructions cannot modify the assistant workflow. Course text remains untrusted even when the teacher supplied it.

## Sharing

A published immutable course version can be shared by an access grant containing its manifest reference, digest, version, optional recipient, and optional expiration. The grant is signed and shared as the course store's storage resource describes; when it is signed, the learner validates the signature before importing a learner-owned access record. A classroom provider may transport the grant.

An educator can revoke the live grant or the underlying storage access. Revocation prevents future retrieval from the educator source but cannot erase a snapshot the learner was explicitly permitted to copy earlier; snapshot distribution should therefore be used only when offline durability is intended.

No ASFAI roster, membership, course-content, or learner-record database participates in this flow.
