# Marble Source Evaluation

This report is generated from [Marble Open Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) commit `96a7933754af672e1bfdbf7ecb05c325860c6e0d`.

The existing ASFAI application at [`redbeard-26/asfai-constitution`](https://github.com/redbeard-26/asfai-constitution) commit `94cb3c47ebfd48c73395ba20e20b1f9454851182` bundles topic and dependency files whose normalized content is identical to this Marble snapshot. It does not bundle Marble's external curriculum catalog; it carries only the standard keys attached to topic records.

## Conversion decision

- Create one provisional ASFAI objective for every Marble micro-topic, with a permanent education.asfai.org URI and deterministic UUID.
- Transform every Marble dependency to prerequisiteOf; export it to CASE as precedes and retain hard/soft strength in the ASFAI extension.
- Retain every source mapping as unreviewed relatedTo. Do not infer exactMatch, closeMatch, broaderThan, or narrowerThan.
- Include every imported record as an identifier-only reference. Do not copy external standard text into the ASFAI package.
- Mark every generated objective, dependency, and alignment provisional and unreviewed.

## Counts

- 1,590 Marble topics → 1,590 provisional ASFAI objectives.
- 3,221 dependencies → 3,221 prerequisite relationships.
- 3,261 external records across 7 frameworks.
- 1,859 topic-to-standard links, covering 1,656 unique external records.
- 1,605 external records are retained as unmapped references.

## Imported-record coverage

| Framework | Records | Linked records | Unlinked records | Topic links | Text copied by ASFAI |
|---|---:|---:|---:|---:|---|
| `uk-nc-2013` | 1117 | 798 | 319 | 895 | no |
| `ib-pyp-pspe` | 138 | 66 | 72 | 70 | no |
| `c3-social-studies` | 338 | 0 | 338 | 0 | no |
| `ccss-ela` | 1028 | 493 | 535 | 528 | no |
| `ccss-math` | 503 | 187 | 316 | 223 | no |
| `ngss-k5` | 78 | 78 | 0 | 85 | no |
| `ngss-ms` | 59 | 34 | 25 | 58 | no |

## Findings

- **positive:** Every source topic has an ID, name, description, age range, domain, and assessment prompt.
- **positive:** Every dependency points to an existing topic; the graph has no self-edges, duplicate pairs, or directed cycles.
- **warning:** 35 topics have no evidence expectations and require rubric authoring.
- **warning:** 23 normalized labels are reused by distinct records. IDs and descriptions, not labels, must determine identity.
- **warning:** 1859 mappings are present, but the source does not state mapping semantics or confidence.
- **warning:** 1605 imported external records have no mapping to a Marble topic.
- **license:** The generated database is derived from Marble and remains subject to ODbL 1.0; adapted Marble-authored text remains CC BY-SA 4.0.
- **license:** External standards are represented by identifiers and links only; upstream standard text is omitted from the ASFAI package.

## Interpretation

This release is a complete mechanical conversion of the available source graph, not a claim that all records are pedagogically final. The ASFAI IDs are permanent, but statements, evidence expectations, prerequisites, and mappings remain versioned and reviewable. A learner record should cite the objective URI and framework version used when evidence was evaluated.
