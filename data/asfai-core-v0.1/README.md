# ASFAI Core Learning Objectives 0.1.0

This directory is the first complete, provisional ASFAI competency catalog. Every canonical identifier uses the future `https://education.asfai.org` namespace; the domain does not need to resolve yet, but these identifiers must not be reassigned.

## Contents

| File | Purpose |
|---|---|
| `objectives.jsonl` / `objectives.csv` | All 1,590 ASFAI learning objectives |
| `relationships.jsonl` / `relationships.csv` | All 3,221 prerequisite relationships |
| `alignments.jsonl` / `alignments.csv` | All 1,859 imported topic-to-standard mappings |
| `external-frameworks.json` | Seven external framework/version records |
| `external-items.jsonl` / `external-items.csv` | All 3,261 imported standard identifiers, including unmapped records |
| `rubrics.json` | The provisional ASFAI general mastery rubric and policy |
| `case-1.1/package.json` | The complete framework exported as a CASE 1.1 package |
| `reports/source-evaluation.*` | Machine-readable and human-readable source-quality findings |
| `manifest.json` | Counts, provenance, licenses, source hashes, and output hashes |

JSON Lines is the authoritative ASFAI-native bulk representation. The CSV files are convenience views and omit nested detail. The CASE package is the interoperability export.

## Status and review

This is a complete **mechanical bootstrap**, not a reviewed national curriculum. Each Marble micro-topic became one ASFAI objective with a permanent UUID and URI. All generated records remain `provisional` and `unreviewed` because:

- objective statements were generated from the source labels and descriptions;
- 35 objectives lack source evidence expectations;
- 23 normalized labels occur on more than one distinct topic;
- Marble's imported mappings do not specify whether a relationship is exact, close, broad, or narrow;
- 1,605 imported standard identifiers have no Marble-topic mapping.

An objective URI may remain stable while later framework versions improve its wording, evidence expectations, or relationships. Evidence and learner records must also store the framework version used for evaluation.

## Mapping rule

All imported mappings are represented conservatively as `relatedTo` and `unreviewed`. A curriculum reviewer can later supersede an assertion with `exactMatch`, `closeMatch`, `broaderThan`, or `narrowerThan`, accompanied by rationale, confidence, reviewer, and review date.

## External standards text

This package includes external framework names, codes, versions, and links, but **does not reproduce external standard statements**. The imported reference list therefore covers UK National Curriculum, IB PYP PSPE, C3, Common Core ELA, Common Core Mathematics, NGSS K–5, and NGSS Middle School without merging their text into ASFAI's content license.

## Licenses and attribution

This database is derived from [Marble Open Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) release 1.0.0 at commit `96a7933754af672e1bfdbf7ecb05c325860c6e0d`.

The existing private ASFAI application snapshot at `redbeard-26/asfai-constitution` commit `94cb3c47ebfd48c73395ba20e20b1f9454851182` contains topic and dependency files whose normalized content is identical to the pinned Marble files. It does not contain Marble's `curriculum-standards.json`; ASFAI previously had only the standard keys embedded in each topic record.

- Database and transformed relationships/mappings: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- Marble-authored and adapted textual fields: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- ASFAI-original generator, schema, documentation, and general rubric: Apache-2.0
- External standards: source-specific terms; only identifiers and links are included here

See the repository [Third-Party Notices](../../THIRD_PARTY_NOTICES.md) and [Licensing Policy](../../docs/LICENSING.md).

## Rebuild and validation

With the pinned Marble repository checked out locally:

```powershell
node scripts/build-marble-seed.mjs --marble C:\path\to\os-taxonomy
npm test
```

The builder refuses a Marble input whose source hashes do not match the pinned snapshot. `npm test` checks output hashes, namespace rules, uniqueness, referential integrity, graph acyclicity, conservative mapping semantics, external-text exclusion, and consistency with the CASE package.
