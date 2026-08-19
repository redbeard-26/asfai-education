# Taxonomies and Data Sources

## Recommended graph strategy

ASFAI Education should not choose a single public taxonomy and treat it as the universal truth. It should maintain three connected layers:

```text
canonical, assessable learning objectives
                  │
                  ▼
official and community framework alignments
                  │
                  ▼
local courses, activities, projects, and resources
```

The canonical layer gives applications durable concepts to reference. Framework alignments preserve jurisdiction and publisher context. The local layer lets a program teach an objective through its own sequence and materials without forking the objective itself.

## Marble Open Source Taxonomy

[Marble's `os-taxonomy` repository](https://github.com/withmarbleapp/os-taxonomy) is a useful seed graph for an early prototype. Its published v1 provenance describes:

- 1,590 topics across eight subject areas;
- 3,221 dependency relationships;
- an approximate age range of 4–15;
- hard and soft dependencies with human-readable reasons;
- evidence statements and assessment prompts;
- mappings to Common Core codes where applicable.

The repository is public, but “open source” has two distinct scopes. Marble licenses the database structure and relationships under ODbL 1.0 and its original textual content under CC BY-SA 4.0. Its [provenance documentation](https://github.com/withmarbleapp/os-taxonomy/blob/main/PROVENANCE.md) also identifies incorporated or referenced standards whose own terms still apply.

### Where Marble fits

Marble is a strong bootstrap source for topic discovery and prerequisite traversal. It is richer than a flat list because an edge can express dependency type and rationale. Its evidence suggestions and assessment prompts are also valuable authoring aids.

### Where Marble does not fit

It should not become ASFAI Education's complete runtime model:

- a topic is not always a precise, observable learning objective;
- its evidence fields are suggestions rather than versioned rubric criteria and performance levels;
- it has no student, event, claim, mastery-state, roster, or credential model;
- Common Core mappings do not make it a complete source for every state or subject;
- dependency order alone cannot represent every framework, assessment, and resource relationship;
- its share-alike and database-license obligations require deliberate distribution design.

The recommended approach is to build a documented importer, retain Marble identifiers and attribution, and transform selected records into the canonical application profile. Do not copy the entire dataset into this repository by default.

## State standards and collaboration

U.S. states remain responsible for adopting and publishing their own academic standards, but many collaborate around common frameworks. The two most prominent examples are:

- [Common Core State Standards](https://corestandards.org/) for mathematics and English language arts/literacy;
- [Next Generation Science Standards](https://www.nextgenscience.org/standards) for science, developed through a multi-state process.

Adoption does not erase state authority. A state may adopt a common framework, revise it, add local material, use different course boundaries, or replace it later. The graph should therefore represent the issuer, jurisdiction, edition, adoption status, and effective dates rather than merging similarly worded standards into one unlabeled record.

Avoid creating fifty independent copies of learner mastery. Maintain learner state against canonical objectives, then use explicit alignment edges to show how that evidence applies to the standards currently used by a jurisdiction. Alignment claims can be `exactMatch`, `closeMatch`, `broaderThan`, `narrowerThan`, or `relatedTo`, and should include their author and review status.

## Common Core resources

The official Common Core site publishes browsable mathematics and English language arts/literacy standards. The original standards are available under a purpose-limited [public license](https://www.thecorestandards.org/public-license/), not a generic open-source software license.

Before redistribution, record the exact source edition and comply with the official attribution, integrity, and use conditions. A third-party copy in an open taxonomy does not replace those obligations.

## NGSS resources

The official NGSS site provides [searchable standards and downloads](https://www.nextgenscience.org/standards). NGSS text, logos, and related marks are governed by its [copyright and trademark terms](https://www.nextgenscience.org/ngss-trademarks-and-copyright/ngss-trademarks-and-copyright).

Store NGSS identifiers and mappings separately from copied descriptive text unless the intended use and distribution are permitted. Codes alone can still support useful alignments to locally authored objectives, rubrics, and activities.

## CASE and CASE Network 2

[1EdTech CASE](https://www.1edtech.org/standards/case) is the best-fit exchange model for K–12 competency frameworks. [CASE Network 2](https://www.1edtech.org/case-global-ecosystem) provides a shared ecosystem for discovering and using frameworks. Public browsing does not necessarily grant unrestricted bulk redistribution, and automated access or supplier participation may require registration, membership, fees, or separate terms.

CASE should be used as an import/export boundary. ASFAI Education may keep additional internal provenance, evidence, and mastery fields that CASE does not cover.

## Import requirements

Every imported framework or taxonomy record must preserve:

- source and canonical URL;
- publisher or issuing jurisdiction;
- official identifier;
- title and version or edition;
- effective and retirement dates where available;
- language;
- retrieval timestamp and content checksum;
- the applicable license and required attribution;
- transformation and mapping history;
- review status and reviewer.

Importers must be repeatable and must never silently replace old versions. A source should remain useful even if its API later changes or a state revises its standards.

## Initial recommendation

Use a small, reviewed subset of Marble as a prototyping seed, author ASFAI's canonical objective and rubric schema around IEEE 1484.20.3 concepts, and use CASE as the principal K–12 framework exchange format. Add official Common Core, NGSS, and state alignments only through source-specific importers with tested licensing and provenance controls.
