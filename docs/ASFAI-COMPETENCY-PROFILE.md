# ASFAI Competency Application Profile 0.1

## Purpose

The ASFAI Competency Application Profile defines canonical learning objectives that games, tutors, courses, projects, assessments, and learner records can reference consistently. It is designed around IEEE 1484.20.2 and IEEE 1484.20.3 concepts and uses 1EdTech CASE 1.1 as its first exchange format.

This document describes an ASFAI application profile. It does not claim IEEE certification or reproduce the IEEE standards.

## Identifier policy

`https://education.asfai.org` is the canonical namespace.

| Resource | URI pattern |
|---|---|
| Objective | `https://education.asfai.org/objectives/{uuid}` |
| ASFAI framework version | `https://education.asfai.org/frameworks/asfai-core/versions/{version}` |
| External framework version reference | `https://education.asfai.org/frameworks/{slug}/versions/{version}` |
| External item reference | `{framework-version-uri}/items/{encoded-code}` |
| Relationship | `https://education.asfai.org/associations/{uuid}` |
| Alignment | `https://education.asfai.org/alignments/{uuid}` |
| Rubric version | `https://education.asfai.org/rubrics/{slug}/versions/{version}` |
| Imported source record | `https://education.asfai.org/sources/{source}/releases/{release}/{record-type}/{source-id}` |

UUIDs are deterministic version-5 UUIDs under a namespace derived from `https://education.asfai.org`. An objective URI is not versioned and must never be reassigned. Framework, rubric, relationship, and mapping records are versioned or superseded independently.

The domain may initially return no representation. When it is deployed, each URI should support HTTPS content negotiation for HTML and JSON and should redirect neither to a different concept nor to the latest incompatible version.

## Objective record

Every learning objective has:

- a globally unique URI, UUID, and human-readable ASFAI code;
- a statement and short label;
- competency type, subject, domain, language, and education level;
- evidence expectations and an assessment prompt where available;
- a versioned mastery-rubric reference;
- lifecycle and review status;
- source and transformation provenance;
- record-level license information.

The 0.1 bootstrap statements use the form `Demonstrate the “{label}” objective: {description}.` This converts noun-phrase topics into objective statements without pretending that an automated rewrite has received curriculum review.

## Relationships

ASFAI uses `prerequisiteOf` when one objective is a genuine dependency for another and retains `hard` or `soft` source strength plus a rationale. In CASE 1.1, the 0.1 export represents this with the standard `precedes` association and carries the stricter ASFAI semantics in `extensions.asfai`.

Future profile versions may also use:

- `isChildOf` and `isPartOf` for hierarchy and composition;
- `precedes` for recommended order that is not a prerequisite;
- `supports` for useful but optional background;
- `assessedBy` for assessment and rubric definitions.

Relationship assertions have their own identity, provenance, review status, and lifecycle. They are not embedded as anonymous arrays whose history cannot be reconstructed.

## External alignments

External standards remain distinct framework records. ASFAI does not silently merge similarly worded standards.

Allowed semantic relationships are:

| ASFAI relation | Meaning |
|---|---|
| `exactMatch` | Interchangeable for the intended assessment and reporting context |
| `closeMatch` | Substantially overlapping but not safely interchangeable |
| `broaderThan` | The ASFAI objective covers more than the external item |
| `narrowerThan` | The ASFAI objective covers less than the external item |
| `relatedTo` | Relevant relationship whose direction or equivalence has not been established |

The initial Marble mappings are all `relatedTo`, `provisional`, and `unreviewed`. A reviewer must not upgrade a mapping without comparing the versioned statements and recording rationale, confidence, reviewer identity, and date.

## Rubrics and mastery

The framework supplies a provisional cross-objective rubric with the levels `not_observed`, `emerging`, `developing`, `proficient`, and `mastered`. Objective-specific evidence expectations refine the representative performance.

The default mastery policy requires two independent demonstrations in materially different contexts and a later retention check. This policy is transparent and versioned; it is not asserted as a universal psychometric rule.

Curriculum and learner state remain separate:

```text
objective + rubric
        │
activity or assessment → evidence event → assessment claim
                                      │
                                      ▼
                         derived learner-objective state
```

An AI may issue a confidence-bearing assessment claim with cited evidence, model/prompt provenance, and rubric version. It must not directly overwrite an unexplained mastery boolean.

## CASE 1.1 exchange

The generated CASE package uses:

- `CFDocument` for the ASFAI framework version;
- `CFItem` for each objective;
- `CFAssociation` for prerequisites and external mappings;
- `CFRubric` for the default mastery rubric;
- `extensions.asfai` for evidence expectations, source provenance, review status, hard/soft dependency strength, and conservative mapping metadata.

The package validates against the CASE 1.1 package schema shipped by the [1EdTech OpenCASE](https://github.com/1EdTech/OpenCASE) project at commit `06e4e617e04708a8059cfecaabd134193f3e2940`.

CASE `isRelatedTo` is used for unreviewed imported mappings. Once reviewed, ASFAI's richer mapping relationship should be represented with a compatible CASE association where available and preserved in the ASFAI extension.

## Publication requirements

Before a framework version is promoted from `provisional`:

1. A qualified curriculum reviewer must approve each objective statement and evidence expectation.
2. Duplicate labels must be disambiguated for human display without changing objective identity.
3. Objectives lacking evidence expectations must receive objective-specific criteria.
4. Prerequisites must be reviewed for necessity and direction.
5. External mappings must receive explicit semantics, versioned targets, rationale, and reviewer provenance.
6. License and attribution metadata must be checked against the planned distribution and use.
7. CASE exports and native files must pass automated validation.

## Learner-record rule

Evidence, assessment claims, and learner-objective states must reference both the stable objective URI and the framework/rubric versions used. They must never contain copied third-party standard text merely because an alignment target exists.
