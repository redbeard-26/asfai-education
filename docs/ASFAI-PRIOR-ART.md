# Existing ASFAI Implementation Assessment

This document records what the education graph in the existing `redbeard-26/asfai-constitution` application actually uses and what would need to change for the ASFAI Education architecture.

## Inspection basis

- Repository: `redbeard-26/asfai-constitution` (private at the time of inspection)
- Default branch: `main`
- Inspected commit: [`94cb3c47ebfd48c73395ba20e20b1f9454851182`](https://github.com/redbeard-26/asfai-constitution/commit/94cb3c47ebfd48c73395ba20e20b1f9454851182)
- Commit date: 2026-08-17
- Repository license detected by GitHub: none

Links into that repository require access. Line references are pinned to the inspected commit so later changes do not alter the evidence.

## Exact upstream graph

The application uses the public [Marble Open Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy). It does **not** call a hosted Marble API at runtime and does not install a Marble package. It vendors two JSON files:

- `src/content/taxonomy/topics.json`
- `src/content/taxonomy/dependencies.json`

The source file states that the graph is an in-memory engine over a bundled, read-only Marble taxonomy and imports those two files directly: [`src/lib/taxonomy.ts`, lines 1–13](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/lib/taxonomy.ts#L1-L13).

The bundled attribution names the upstream repository and records its two principal licenses: [`src/content/taxonomy/ATTRIBUTION.md`, lines 1–22](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/content/taxonomy/ATTRIBUTION.md#L1-L22).

There is therefore no Marble API endpoint, environment variable, client library, or package name to preserve. The integration boundary is the upstream JSON schema plus the local TypeScript loader.

## What the current graph represents

The local `Topic` interface preserves Marble's identifier, concept type, subject, domain, name, description, age range, centrality, evidence suggestions, assessment prompt, and standards codes: [`src/lib/taxonomy.ts`, lines 15–35](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/lib/taxonomy.ts#L15-L35).

Dependencies preserve the dependent topic, prerequisite topic, `hard` or `soft` strength, and reason: [`src/lib/taxonomy.ts`, lines 37–44](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/lib/taxonomy.ts#L37-L44). The loader builds both prerequisite and unlock indexes in memory: [`src/lib/taxonomy.ts`, lines 69–96](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/lib/taxonomy.ts#L69-L96).

The learning frontier treats all hard prerequisites as gates. It ranks eligible topics using age range, centrality, and unlock count: [`src/lib/taxonomy.ts`, lines 199–245](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/lib/taxonomy.ts#L199-L245). The visible graph labels nodes as `mastered`, `frontier`, or `locked`: [`src/lib/taxonomy.ts`, lines 283–305](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/lib/taxonomy.ts#L283-L305).

## What the current learner model represents

Learner progress is stored as one row per user and Marble topic. The only states are `LEARNING` and `MASTERED`; the row has an optional free-text evidence field and assessment timestamp: [`prisma/schema.prisma`, lines 250–269](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/prisma/schema.prisma#L250-L269).

The `recordMastery` function directly upserts `MASTERED` and optionally saves one evidence string: [`src/lib/learning.ts`, lines 93–113](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/lib/learning.ts#L93-L113). A server action lets the signed-in learner invoke that transition directly: [`src/app/learn/actions.ts`, lines 15–23](https://github.com/redbeard-26/asfai-constitution/blob/94cb3c47ebfd48c73395ba20e20b1f9454851182/src/app/learn/actions.ts#L15-L23).

## Fit against the proposed model

| Required capability | Current implementation | Assessment |
|---|---|---|
| Learning objectives | Marble micro-topics with stable IDs and descriptive fields | Useful seed, although some topics need refinement into observable objectives |
| Prerequisites/dependencies | Directed hard/soft edges with reasons | Strongest part of the current model |
| Evaluation standards and rubrics | Evidence strings and one assessment prompt per topic | Insufficient: no rubric, criteria, levels, versions, or assessor provenance |
| Assessments and evidence | One optional free-text evidence value on the current mastery row | Insufficient: no immutable events, artifacts, attempts, item results, or superseding claims |
| Learner tracking | Binary `LEARNING`/`MASTERED` state per topic | Useful prototype, but no confidence, history, recency, independence, or policy version |
| Framework interoperability | String codes in a topic's `standards` array | Insufficient: no versioned framework objects, alignment types, or CASE import/export |
| Learning resources and activities | Not part of the taxonomy or mastery row | Missing |
| Portable records | Not represented | Missing |

The current graph is compatible with part of an IEEE 1484.20.3-inspired model—competency-like nodes, frameworks by implication, and typed relationships—but it is not a complete implementation of that standard. In particular, Marble evidence suggestions are not formal rubrics, and the local learner row mixes the conclusion with the only evidence note.

## Migration recommendation

1. Keep the existing Marble JSON import as a provisional source adapter, preserving upstream IDs and licenses.
2. Introduce versioned canonical objectives and explicit source alignments instead of using Marble IDs as the permanent learner-record key.
3. Split `ConceptMastery.evidence` into immutable evidence events, artifacts, and versioned assessment claims.
4. Replace direct mastery writes with a mastery-policy calculation whose result includes provenance and confidence.
5. Add rubrics, criteria, and performance levels based on the ASFAI application profile.
6. Add activity/objective alignments so games and projects can contribute evidence to the same objective.
7. Keep `LEARNING` and `MASTERED` as display categories if useful, but derive them from a richer learner-objective state.

Because `asfai-constitution` had no repository license at the inspected snapshot, its code should not be copied into a public repository until the owner applies an explicit license. This repository instead records the design and pinned factual references; it does not copy that private source or the Marble dataset.
