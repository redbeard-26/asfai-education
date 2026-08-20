import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const OUTPUT_DIR = join(REPO_ROOT, "data", "asfai-core-v0.1");
const DOMAIN = "https://education.asfai.org";
const RELEASE_VERSION = "0.1.0";
const RELEASED_AT = "2026-08-19T00:00:00.000Z";
const MARBLE_REPOSITORY = "https://github.com/withmarbleapp/os-taxonomy";
const MARBLE_COMMIT = "96a7933754af672e1bfdbf7ecb05c325860c6e0d";
const MARBLE_RELEASE = "1.0.0";
const SOURCE_APPLICATION_REPOSITORY = "https://github.com/redbeard-26/asfai-constitution";
const SOURCE_APPLICATION_COMMIT = "94cb3c47ebfd48c73395ba20e20b1f9454851182";
const OPENCASE_REPOSITORY = "https://github.com/1EdTech/OpenCASE";
const OPENCASE_COMMIT = "06e4e617e04708a8059cfecaabd134193f3e2940";
const URL_NAMESPACE_UUID = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const ASFAI_NAMESPACE_UUID = uuidV5(DOMAIN, URL_NAMESPACE_UUID);

const FRAMEWORK_ID = `${DOMAIN}/frameworks/asfai-core/versions/${RELEASE_VERSION}`;
const FRAMEWORK_UUID = uuidV5(`framework:asfai-core:${RELEASE_VERSION}`, ASFAI_NAMESPACE_UUID);
const RUBRIC_ID = `${DOMAIN}/rubrics/general-mastery/versions/${RELEASE_VERSION}`;
const RUBRIC_UUID = uuidV5(`rubric:general-mastery:${RELEASE_VERSION}`, ASFAI_NAMESPACE_UUID);

const SOURCE_LANDING_PAGES = {
  "uk-nc-2013": "https://www.gov.uk/government/publications/national-curriculum-in-england-framework-for-key-stages-1-to-4",
  "ib-pyp-pspe": "https://www.ibo.org/programmes/primary-years-programme/curriculum/",
  "c3-social-studies": "https://www.socialstudies.org/sites/default/files/c3/C3-Framework-for-Social-Studies.pdf",
  "ccss-ela": "https://corestandards.org/english-language-arts-standards/",
  "ccss-math": "https://corestandards.org/mathematics-standards/",
  "ngss-k5": "https://www.nextgenscience.org/search-standards",
  "ngss-ms": "https://www.nextgenscience.org/search-standards"
};

const SUBJECT_CODES = {
  Computing: "CMP",
  English: "ELA",
  History: "HIS",
  "Learning to Learn": "LTL",
  "Life Skills": "LIF",
  Mathematics: "MAT",
  "Personal & Social Development": "PSD",
  Science: "SCI"
};

const argv = process.argv.slice(2);
const marbleArg = readOption(argv, "--marble") ?? process.env.ASFAI_MARBLE_SOURCE;
if (!marbleArg) {
  fail("Provide the Marble checkout with --marble <path> or ASFAI_MARBLE_SOURCE.");
}

const marbleRoot = resolve(marbleArg);
const marbleData = join(marbleRoot, "data");
const [topicsFile, dependenciesFile, curriculaFile, sourceManifestFile] = await Promise.all([
  readFile(join(marbleData, "topics.json"), "utf8"),
  readFile(join(marbleData, "dependencies.json"), "utf8"),
  readFile(join(marbleData, "curriculum-standards.json"), "utf8"),
  readFile(join(marbleData, "manifest.json"), "utf8")
]);

const topicsSource = JSON.parse(topicsFile);
const dependenciesSource = JSON.parse(dependenciesFile);
const curriculaSource = JSON.parse(curriculaFile);
const marbleManifest = JSON.parse(sourceManifestFile);

assertSourceSnapshot({ topicsFile, dependenciesFile, curriculaFile, marbleManifest });

const duplicateLabels = duplicateValues(topicsSource.topics, (topic) => normalize(topic.name));
const topicById = new Map(topicsSource.topics.map((topic) => [topic.id, topic]));
const objectiveBySourceId = new Map();

const objectives = [...topicsSource.topics]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((topic) => {
    const uuid = uuidV5(`objective:marble:${topic.id}`, ASFAI_NAMESPACE_UUID);
    const id = `${DOMAIN}/objectives/${uuid}`;
    const subjectCode = SUBJECT_CODES[topic.subject] ?? "GEN";
    const humanCodingScheme = `ASFAI-${subjectCode}-${sha256(topic.id).slice(0, 10).toUpperCase()}`;
    const flags = ["generated-statement", "requires-curriculum-review"];
    if (!topic.evidence.length) flags.push("missing-source-evidence-expectations");
    if (duplicateLabels.has(normalize(topic.name))) flags.push("duplicate-source-label");

    const objective = {
      id,
      uuid,
      humanCodingScheme,
      frameworkId: FRAMEWORK_ID,
      type: "LearningObjective",
      label: topic.name,
      statement: objectiveStatement(topic),
      description: topic.description,
      competencyType: topic.type,
      subject: topic.subject,
      domain: topic.domain,
      educationLevel: {
        minimumAge: topic.ageRangeStart,
        maximumAge: topic.ageRangeEnd,
        label: `Ages ${topic.ageRangeStart}-${topic.ageRangeEnd}`
      },
      evidenceExpectations: topic.evidence,
      assessmentPrompt: topic.assessmentPrompt,
      masteryRubricId: RUBRIC_ID,
      status: "provisional",
      language: "en",
      review: {
        status: "unreviewed",
        flags
      },
      provenance: {
        derivation: "transformed",
        sourceName: "Marble Open Skill Taxonomy",
        sourceId: topic.id,
        sourceVersion: topicsSource.version,
        sourceRelease: MARBLE_RELEASE,
        sourceCommit: MARBLE_COMMIT,
        sourceReferenceId: `${DOMAIN}/sources/marble/releases/${MARBLE_RELEASE}/topics/${encodeURIComponent(topic.id)}`,
        sourceUri: `${MARBLE_REPOSITORY}/blob/${MARBLE_COMMIT}/data/topics.json`,
        databaseLicense: "ODbL-1.0",
        contentLicense: "CC-BY-SA-4.0"
      }
    };
    objectiveBySourceId.set(topic.id, objective);
    return objective;
  });

const externalFrameworks = curriculaSource.curricula.map((curriculum) => {
  const versionSlug = slugify(curriculum.version);
  const id = `${DOMAIN}/frameworks/${curriculum.slug}/versions/${versionSlug}`;
  return {
    id,
    uuid: uuidV5(`external-framework:${curriculum.slug}:${curriculum.version}`, ASFAI_NAMESPACE_UUID),
    slug: curriculum.slug,
    name: curriculum.name,
    country: curriculum.country,
    version: curriculum.version,
    sourceLandingPage: SOURCE_LANDING_PAGES[curriculum.slug] ?? curriculum.sourceUrl,
    sourceUrlRecordedByMarble: curriculum.sourceUrl,
    textIncludedInMarbleSnapshot: curriculum.textIncluded,
    textIncludedInAsfaiPackage: false,
    itemCount: curriculum.topics.length,
    upstreamRightsSummary: curriculum.license,
    provenance: {
      mappingSource: "Marble Open Skill Taxonomy",
      sourceCommit: MARBLE_COMMIT,
      sourceUri: `${MARBLE_REPOSITORY}/blob/${MARBLE_COMMIT}/data/curriculum-standards.json`
    }
  };
});

const externalFrameworkBySlug = new Map(externalFrameworks.map((framework) => [framework.slug, framework]));
const externalItemByKey = new Map();
const externalItems = curriculaSource.curricula
  .flatMap((curriculum) => curriculum.topics.map((item) => {
    const framework = externalFrameworkBySlug.get(curriculum.slug);
    const uuid = uuidV5(`external-item:${item.key}`, ASFAI_NAMESPACE_UUID);
    const record = {
      id: `${framework.id}/items/${encodeURIComponent(item.code)}`,
      uuid,
      frameworkId: framework.id,
      frameworkSlug: curriculum.slug,
      sourceKey: item.key,
      code: item.code,
      sourceVersion: curriculum.version,
      sourceLandingPage: framework.sourceLandingPage,
      textAvailableInMarbleSnapshot: Boolean(curriculum.textIncluded),
      textIncludedInAsfaiPackage: false,
      linkedObjectiveCount: 0,
      review: {
        status: "reference-only"
      }
    };
    externalItemByKey.set(item.key, record);
    return record;
  }))
  .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));

const relationships = dependenciesSource.dependencies.map((edge) => {
  const prerequisite = objectiveBySourceId.get(edge.prerequisiteId);
  const dependent = objectiveBySourceId.get(edge.topicId);
  if (!prerequisite || !dependent) fail(`Dependency references an unknown topic: ${JSON.stringify(edge)}`);
  const uuid = uuidV5(
    `relationship:prerequisiteOf:${prerequisite.uuid}:${dependent.uuid}`,
    ASFAI_NAMESPACE_UUID
  );
  return {
    id: `${DOMAIN}/associations/${uuid}`,
    uuid,
    frameworkId: FRAMEWORK_ID,
    relationshipType: "prerequisiteOf",
    fromObjectiveId: prerequisite.id,
    toObjectiveId: dependent.id,
    strength: edge.strength,
    rationale: edge.reason,
    caseAssociationType: "precedes",
    status: "provisional",
    review: {
      status: "unreviewed"
    },
    provenance: {
      derivation: "transformed",
      sourceName: "Marble Open Skill Taxonomy",
      sourceTopicId: edge.topicId,
      sourcePrerequisiteId: edge.prerequisiteId,
      sourceCommit: MARBLE_COMMIT,
      sourceUri: `${MARBLE_REPOSITORY}/blob/${MARBLE_COMMIT}/data/dependencies.json`,
      databaseLicense: "ODbL-1.0",
      contentLicense: "CC-BY-SA-4.0"
    }
  };
}).sort((a, b) => a.id.localeCompare(b.id));

const alignments = [];
for (const sourceTopic of topicsSource.topics) {
  const objective = objectiveBySourceId.get(sourceTopic.id);
  for (const standardKey of sourceTopic.standards) {
    const target = externalItemByKey.get(standardKey);
    if (!target) fail(`Topic ${sourceTopic.id} references unknown external item ${standardKey}`);
    target.linkedObjectiveCount += 1;
    const uuid = uuidV5(`alignment:relatedTo:${objective.uuid}:${target.uuid}`, ASFAI_NAMESPACE_UUID);
    alignments.push({
      id: `${DOMAIN}/alignments/${uuid}`,
      uuid,
      objectiveId: objective.id,
      targetId: target.id,
      targetFrameworkId: target.frameworkId,
      targetFrameworkSlug: target.frameworkSlug,
      targetCode: target.code,
      relation: "relatedTo",
      mappingConfidence: null,
      mappingRationale: null,
      status: "provisional",
      review: {
        status: "unreviewed",
        reason: "The source provides a link but does not declare exact, close, broad, or narrow match semantics."
      },
      provenance: {
        derivation: "imported-mapping",
        sourceName: "Marble Open Skill Taxonomy",
        sourceTopicId: sourceTopic.id,
        sourceStandardKey: standardKey,
        sourceCommit: MARBLE_COMMIT,
        sourceUri: `${MARBLE_REPOSITORY}/blob/${MARBLE_COMMIT}/data/topics.json`,
        databaseLicense: "ODbL-1.0"
      }
    });
  }
}
alignments.sort((a, b) => a.id.localeCompare(b.id));

const rubric = {
  id: RUBRIC_ID,
  uuid: RUBRIC_UUID,
  title: "ASFAI General Mastery Rubric",
  version: RELEASE_VERSION,
  status: "provisional",
  description: "A cross-objective default rubric. Objective-specific evidence expectations refine what counts as a representative demonstration.",
  criteria: [
    {
      id: `${RUBRIC_ID}/criteria/demonstration`,
      code: "demonstration",
      title: "Quality and independence of demonstration",
      levels: [
        { code: "not_observed", score: 0, descriptor: "No interpretable evidence has been collected." },
        { code: "emerging", score: 1, descriptor: "Shows partial understanding or performance with substantial assistance." },
        { code: "developing", score: 2, descriptor: "Succeeds in a familiar task with some assistance or inconsistency." },
        { code: "proficient", score: 3, descriptor: "Independently satisfies the objective's evidence expectations in a representative task." },
        { code: "mastered", score: 4, descriptor: "Independently satisfies the evidence expectations across materially different contexts and later demonstrates retention." }
      ]
    }
  ],
  masteryPolicy: {
    requiredMinimumLevel: "mastered",
    minimumIndependentDemonstrations: 2,
    minimumMateriallyDifferentContexts: 2,
    retentionCheckRequired: true,
    note: "This is a transparent default, not a universal psychometric claim. Programs may issue a versioned replacement policy."
  },
  license: "Apache-2.0"
};

const framework = {
  id: FRAMEWORK_ID,
  uuid: FRAMEWORK_UUID,
  canonicalBaseUri: DOMAIN,
  title: "ASFAI Core Learning Objectives",
  creator: "ASFAI Education",
  publisher: "ASFAI Education",
  description: "A provisional, standards-aligned competency framework transformed from the Marble Open Skill Taxonomy and assigned permanent ASFAI identifiers.",
  version: RELEASE_VERSION,
  status: "provisional",
  language: "en",
  releasedAt: RELEASED_AT,
  standardsProfile: [
    "IEEE 1484.20.2-2022 aligned",
    "IEEE 1484.20.3-2022 aligned",
    "1EdTech CASE 1.1 exchange"
  ],
  license: {
    database: "ODbL-1.0",
    derivedText: "CC-BY-SA-4.0",
    asfaiOriginalCodeAndRubric: "Apache-2.0"
  },
  counts: {
    objectives: objectives.length,
    relationships: relationships.length,
    alignments: alignments.length,
    externalFrameworks: externalFrameworks.length,
    externalItems: externalItems.length
  }
};

const sourceEvaluation = evaluateSource({
  topics: topicsSource.topics,
  dependencies: dependenciesSource.dependencies,
  curricula: curriculaSource.curricula,
  objectiveBySourceId,
  externalItemByKey,
  alignments
});

const casePackage = makeCasePackage({ framework, objectives, relationships, alignments, externalItemByKey, rubric });

await mkdir(join(OUTPUT_DIR, "case-1.1"), { recursive: true });
await mkdir(join(OUTPUT_DIR, "reports"), { recursive: true });

const outputFiles = new Map([
  ["framework.json", json(framework)],
  ["rubrics.json", json({ rubrics: [rubric] })],
  ["objectives.jsonl", jsonLines(objectives)],
  ["objectives.csv", csv(objectives.map((objective) => ({
    code: objective.humanCodingScheme,
    id: objective.id,
    label: objective.label,
    statement: objective.statement,
    subject: objective.subject,
    domain: objective.domain,
    minimumAge: objective.educationLevel.minimumAge,
    maximumAge: objective.educationLevel.maximumAge,
    competencyType: objective.competencyType,
    evidenceExpectationCount: objective.evidenceExpectations.length,
    alignmentCount: alignments.filter((alignment) => alignment.objectiveId === objective.id).length,
    reviewStatus: objective.review.status,
    sourceId: objective.provenance.sourceId,
    sourceReferenceId: objective.provenance.sourceReferenceId,
    sourceUri: objective.provenance.sourceUri
  })))],
  ["relationships.jsonl", jsonLines(relationships)],
  ["relationships.csv", csv(relationships.map((relationship) => ({
    id: relationship.id,
    fromObjectiveId: relationship.fromObjectiveId,
    toObjectiveId: relationship.toObjectiveId,
    relationshipType: relationship.relationshipType,
    strength: relationship.strength,
    rationale: relationship.rationale,
    caseAssociationType: relationship.caseAssociationType,
    reviewStatus: relationship.review.status
  })))],
  ["alignments.jsonl", jsonLines(alignments)],
  ["alignments.csv", csv(alignments.map((alignment) => ({
    id: alignment.id,
    objectiveId: alignment.objectiveId,
    relation: alignment.relation,
    targetFramework: alignment.targetFrameworkSlug,
    targetCode: alignment.targetCode,
    targetId: alignment.targetId,
    reviewStatus: alignment.review.status,
    sourceTopicId: alignment.provenance.sourceTopicId,
    sourceStandardKey: alignment.provenance.sourceStandardKey
  })))],
  ["external-frameworks.json", json({ frameworks: externalFrameworks })],
  ["external-items.jsonl", jsonLines(externalItems)],
  ["external-items.csv", csv(externalItems.map((item) => ({
    id: item.id,
    framework: item.frameworkSlug,
    code: item.code,
    sourceKey: item.sourceKey,
    sourceVersion: item.sourceVersion,
    linkedObjectiveCount: item.linkedObjectiveCount,
    textIncludedInAsfaiPackage: item.textIncludedInAsfaiPackage,
    sourceLandingPage: item.sourceLandingPage
  })))],
  ["case-1.1/package.json", json(casePackage)],
  ["reports/source-evaluation.json", json(sourceEvaluation)],
  ["reports/source-evaluation.md", evaluationMarkdown(sourceEvaluation)]
]);

for (const [relativePath, contents] of outputFiles) {
  await writeFile(join(OUTPUT_DIR, relativePath), contents, "utf8");
}

const manifest = {
  dataset: "ASFAI Core Learning Objectives",
  version: RELEASE_VERSION,
  releasedAt: RELEASED_AT,
  canonicalBaseUri: DOMAIN,
  frameworkId: FRAMEWORK_ID,
  status: "provisional",
  source: {
    repository: MARBLE_REPOSITORY,
    commit: MARBLE_COMMIT,
    release: MARBLE_RELEASE,
    taxonomyVersion: topicsSource.version,
    generatedAt: marbleManifest.generatedAt,
    files: {
      "topics.json": sha256(normalizeNewlines(topicsFile)),
      "dependencies.json": sha256(normalizeNewlines(dependenciesFile)),
      "curriculum-standards.json": sha256(normalizeNewlines(curriculaFile))
    }
  },
  existingAsfaiSnapshot: {
    repository: SOURCE_APPLICATION_REPOSITORY,
    commit: SOURCE_APPLICATION_COMMIT,
    integration: "Bundled src/content/taxonomy/topics.json and dependencies.json; no hosted API or package.",
    topicsNormalizedSha256: "2d99fc3b5e57d9ddb86b6c179b58a1b0390f048d9798585fe03b13cbc183719b",
    dependenciesNormalizedSha256: "86a24efb44b480e5be23082b4bdea653f69f6d6fd54c5409a2f33c185be1d87f",
    contentIdenticalToPinnedMarbleSnapshot: true,
    externalCurriculumCatalogBundled: false
  },
  licenses: {
    database: "ODbL-1.0",
    marbleDerivedText: "CC-BY-SA-4.0",
    externalStandards: "Source-specific; this package includes identifiers and links only.",
    asfaiOriginalCodeDocumentationAndRubric: "Apache-2.0"
  },
  caseExport: {
    version: "1.1",
    file: "case-1.1/package.json",
    validationSchema: `${OPENCASE_REPOSITORY}/blob/${OPENCASE_COMMIT}/apps/editor/schemas/case-v1p1-cfpackage.json`,
    schemaCommit: OPENCASE_COMMIT
  },
  counts: framework.counts,
  quality: sourceEvaluation.summary,
  files: Object.fromEntries(
    [...outputFiles.entries()].map(([relativePath, contents]) => [relativePath, {
      bytes: Buffer.byteLength(contents),
      sha256: sha256(contents)
    }])
  )
};
await writeFile(join(OUTPUT_DIR, "manifest.json"), json(manifest), "utf8");

console.log(JSON.stringify({ output: OUTPUT_DIR, counts: framework.counts, quality: sourceEvaluation.summary }, null, 2));

function makeCasePackage({ framework, objectives, relationships, alignments, externalItemByKey, rubric }) {
  const documentLink = {
    title: framework.title,
    identifier: framework.uuid,
    uri: framework.id,
    targetType: "CASE"
  };
  const objectiveLink = (objective) => ({
    title: objective.label,
    identifier: objective.uuid,
    uri: objective.id,
    targetType: "CASE"
  });
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));

  return {
    document: {
      sourcedId: framework.uuid,
      uri: framework.id,
      title: framework.title,
      creator: framework.creator,
      description: framework.description,
      subject: [...new Set(objectives.map((objective) => objective.subject))].sort(),
      language: framework.language,
      frameworkType: "CompetencyFramework",
      version: framework.version,
      lastChangeDateTime: RELEASED_AT,
      adoptionStatus: "Private Draft",
      officialSourceURL: framework.id,
      publisher: framework.publisher,
      licenseURI: {
        title: "Open Data Commons Open Database License 1.0",
        identifier: "ODbL-1.0",
        uri: "https://opendatacommons.org/licenses/odbl/1-0/"
      },
      notes: "Provisional bootstrap release; objective and mapping review is incomplete.",
      statusStartDate: RELEASED_AT.slice(0, 10),
      caseVersion: "1.1",
      extensions: {
        asfai: {
          standardsProfile: framework.standardsProfile,
          derivedTextLicense: "CC-BY-SA-4.0",
          canonicalBaseUri: DOMAIN
        }
      }
    },
    items: objectives.map((objective) => ({
      sourcedId: objective.uuid,
      uri: objective.id,
      fullStatement: objective.statement,
      humanCodingScheme: objective.humanCodingScheme,
      alternativeLabel: objective.label,
      abbreviatedStatement: objective.label,
      CFItemType: "Learning Objective",
      conceptKeywords: [objective.domain, objective.competencyType],
      notes: objective.description,
      language: objective.language,
      subject: [objective.subject],
      educationLevel: [objective.educationLevel.label],
      licenseURI: {
        title: "Creative Commons Attribution-ShareAlike 4.0 International",
        identifier: "CC-BY-SA-4.0",
        uri: "https://creativecommons.org/licenses/by-sa/4.0/"
      },
      statusStartDate: RELEASED_AT.slice(0, 10),
      lastChangeDateTime: RELEASED_AT,
      CFDocumentURI: documentLink,
      extensions: {
        asfai: {
          competencyType: objective.competencyType,
          educationLevel: objective.educationLevel,
          evidenceExpectations: objective.evidenceExpectations,
          assessmentPrompt: objective.assessmentPrompt,
          masteryRubricURI: RUBRIC_ID,
          status: objective.status,
          review: objective.review,
          provenance: objective.provenance
        }
      }
    })),
    associations: [
      ...relationships.map((relationship) => {
        const from = objectiveById.get(relationship.fromObjectiveId);
        const to = objectiveById.get(relationship.toObjectiveId);
        return {
          sourcedId: relationship.uuid,
          uri: relationship.id,
          associationType: relationship.caseAssociationType,
          originNodeURI: objectiveLink(from),
          destinationNodeURI: objectiveLink(to),
          CFDocumentURI: documentLink,
          lastChangeDateTime: RELEASED_AT,
          extensions: {
            asfai: {
              relationshipType: relationship.relationshipType,
              strength: relationship.strength,
              rationale: relationship.rationale,
              status: relationship.status,
              review: relationship.review,
              provenance: relationship.provenance
            }
          }
        };
      }),
      ...alignments.map((alignment) => {
        const from = objectiveById.get(alignment.objectiveId);
        const target = externalItemByKey.get(alignment.provenance.sourceStandardKey);
        return {
          sourcedId: alignment.uuid,
          uri: alignment.id,
          associationType: "isRelatedTo",
          originNodeURI: objectiveLink(from),
          destinationNodeURI: {
            title: `${target.frameworkSlug} ${target.code}`,
            identifier: target.uuid,
            uri: target.id,
            targetType: "CASE"
          },
          CFDocumentURI: documentLink,
          lastChangeDateTime: RELEASED_AT,
          extensions: {
            asfai: {
              relationshipType: alignment.relation,
              targetFrameworkURI: target.frameworkId,
              mappingConfidence: alignment.mappingConfidence,
              mappingRationale: alignment.mappingRationale,
              status: alignment.status,
              review: alignment.review,
              provenance: alignment.provenance
            }
          }
        };
      })
    ],
    rubrics: [{
      sourcedId: rubric.uuid,
      uri: rubric.id,
      title: rubric.title,
      description: rubric.description,
      lastChangeDateTime: RELEASED_AT,
      CFRubricCriteria: rubric.criteria,
      extensions: {
        asfai: {
          version: rubric.version,
          status: rubric.status,
          masteryPolicy: rubric.masteryPolicy,
          license: rubric.license
        }
      }
    }],
    definitions: {
      CFItemTypes: [{ code: "Learning Objective", title: "Learning Objective" }],
      CFAssociationGroupings: [
        { code: "precedes", title: "Dependency order" },
        { code: "isRelatedTo", title: "Unreviewed external alignment" }
      ],
      extensions: {
        asfai: {
          applicationProfile: `${DOMAIN}/profiles/competency/versions/${RELEASE_VERSION}`
        }
      }
    }
  };
}

function evaluateSource({ topics, dependencies, curricula, externalItemByKey, alignments }) {
  const topicIds = new Set(topics.map((topic) => topic.id));
  const topicStandardLinks = topics.flatMap((topic) => topic.standards.map((key) => ({ topicId: topic.id, key })));
  const linkedExternalKeys = new Set(topicStandardLinks.map((link) => link.key));
  const duplicateLabels = duplicateValues(topics, (topic) => normalize(topic.name));
  const duplicateDescriptions = duplicateValues(topics, (topic) => normalize(topic.description));
  const dependencyPairs = new Set();
  let duplicateDependencyCount = 0;
  for (const edge of dependencies) {
    const pair = `${edge.prerequisiteId}->${edge.topicId}`;
    if (dependencyPairs.has(pair)) duplicateDependencyCount += 1;
    dependencyPairs.add(pair);
  }

  const cycles = findCycles(topics, dependencies);
  const byType = countBy(topics, (topic) => topic.type);
  const bySubject = countBy(topics, (topic) => topic.subject);
  const relationshipsByStrength = countBy(dependencies, (edge) => edge.strength);
  const externalByFramework = Object.fromEntries(curricula.map((curriculum) => {
    const linked = curriculum.topics.filter((item) => linkedExternalKeys.has(item.key)).length;
    return [curriculum.slug, {
      records: curriculum.topics.length,
      linkedRecords: linked,
      unlinkedRecords: curriculum.topics.length - linked,
      topicLinks: alignments.filter((alignment) => alignment.targetFrameworkSlug === curriculum.slug).length,
      textIncludedInMarbleSnapshot: curriculum.textIncluded,
      textIncludedInAsfaiPackage: false,
      recordsMissingTextInMarbleSnapshot: curriculum.topics.filter((item) => !item.data).length
    }];
  }));

  const summary = {
    sourceTopics: topics.length,
    generatedObjectives: topics.length,
    sourceDependencies: dependencies.length,
    generatedRelationships: dependencies.length,
    externalFrameworks: curricula.length,
    externalRecords: externalItemByKey.size,
    externalRecordsLinked: linkedExternalKeys.size,
    externalRecordsUnlinked: externalItemByKey.size - linkedExternalKeys.size,
    topicToExternalLinks: topicStandardLinks.length,
    topicsWithoutEvidenceExpectations: topics.filter((topic) => topic.evidence.length === 0).length,
    topicsWithoutExternalAlignments: topics.filter((topic) => topic.standards.length === 0).length,
    duplicateTopicLabels: duplicateLabels.size,
    duplicateTopicDescriptions: duplicateDescriptions.size,
    invalidDependencyReferences: dependencies.filter((edge) => !topicIds.has(edge.topicId) || !topicIds.has(edge.prerequisiteId)).length,
    duplicateDependencies: duplicateDependencyCount,
    selfDependencies: dependencies.filter((edge) => edge.topicId === edge.prerequisiteId).length,
    dependencyCycles: cycles.length,
    missingExternalReferences: topicStandardLinks.filter((link) => !externalItemByKey.has(link.key)).length
  };

  return {
    inspectedSource: {
      repository: MARBLE_REPOSITORY,
      commit: MARBLE_COMMIT,
      release: MARBLE_RELEASE,
      existingAsfaiApplication: {
        repository: SOURCE_APPLICATION_REPOSITORY,
        commit: SOURCE_APPLICATION_COMMIT,
        topicsAndDependenciesContentIdentical: true,
        externalCurriculumCatalogBundled: false
      }
    },
    decision: {
      objectivePolicy: "Create one provisional ASFAI objective for every Marble micro-topic, with a permanent education.asfai.org URI and deterministic UUID.",
      dependencyPolicy: "Transform every Marble dependency to prerequisiteOf; export it to CASE as precedes and retain hard/soft strength in the ASFAI extension.",
      alignmentPolicy: "Retain every source mapping as unreviewed relatedTo. Do not infer exactMatch, closeMatch, broaderThan, or narrowerThan.",
      externalRecordPolicy: "Include every imported record as an identifier-only reference. Do not copy external standard text into the ASFAI package.",
      reviewPolicy: "Mark every generated objective, dependency, and alignment provisional and unreviewed."
    },
    summary,
    distributions: {
      topicsByType: byType,
      topicsBySubject: bySubject,
      relationshipsByStrength,
      externalByFramework
    },
    findings: [
      {
        severity: "positive",
        finding: "Every source topic has an ID, name, description, age range, domain, and assessment prompt."
      },
      {
        severity: "positive",
        finding: "Every dependency points to an existing topic; the graph has no self-edges, duplicate pairs, or directed cycles."
      },
      {
        severity: "warning",
        finding: `${summary.topicsWithoutEvidenceExpectations} topics have no evidence expectations and require rubric authoring.`
      },
      {
        severity: "warning",
        finding: `${summary.duplicateTopicLabels} normalized labels are reused by distinct records. IDs and descriptions, not labels, must determine identity.`
      },
      {
        severity: "warning",
        finding: `${summary.topicToExternalLinks} mappings are present, but the source does not state mapping semantics or confidence.`
      },
      {
        severity: "warning",
        finding: `${summary.externalRecordsUnlinked} imported external records have no mapping to a Marble topic.`
      },
      {
        severity: "license",
        finding: "The generated database is derived from Marble and remains subject to ODbL 1.0; adapted Marble-authored text remains CC BY-SA 4.0."
      },
      {
        severity: "license",
        finding: "External standards are represented by identifiers and links only; upstream standard text is omitted from the ASFAI package."
      }
    ],
    duplicateLabels: [...duplicateLabels.entries()].map(([label, ids]) => ({ label, sourceIds: ids })),
    cycles
  };
}

function evaluationMarkdown(evaluation) {
  const s = evaluation.summary;
  const rows = Object.entries(evaluation.distributions.externalByFramework)
    .map(([slug, item]) => `| \`${slug}\` | ${item.records} | ${item.linkedRecords} | ${item.unlinkedRecords} | ${item.topicLinks} | ${item.textIncludedInAsfaiPackage ? "yes" : "no"} |`)
    .join("\n");
  const findings = evaluation.findings.map((item) => `- **${item.severity}:** ${item.finding}`).join("\n");
  return `# Marble Source Evaluation\n\n` +
    `This report is generated from [Marble Open Skill Taxonomy](${MARBLE_REPOSITORY}) commit \`${MARBLE_COMMIT}\`.\n\n` +
    `The existing ASFAI application at [\`redbeard-26/asfai-constitution\`](${SOURCE_APPLICATION_REPOSITORY}) commit \`${SOURCE_APPLICATION_COMMIT}\` bundles topic and dependency files whose normalized content is identical to this Marble snapshot. It does not bundle Marble's external curriculum catalog; it carries only the standard keys attached to topic records.\n\n` +
    `## Conversion decision\n\n` +
    `- ${evaluation.decision.objectivePolicy}\n` +
    `- ${evaluation.decision.dependencyPolicy}\n` +
    `- ${evaluation.decision.alignmentPolicy}\n` +
    `- ${evaluation.decision.externalRecordPolicy}\n` +
    `- ${evaluation.decision.reviewPolicy}\n\n` +
    `## Counts\n\n` +
    `- ${s.sourceTopics.toLocaleString("en-US")} Marble topics → ${s.generatedObjectives.toLocaleString("en-US")} provisional ASFAI objectives.\n` +
    `- ${s.sourceDependencies.toLocaleString("en-US")} dependencies → ${s.generatedRelationships.toLocaleString("en-US")} prerequisite relationships.\n` +
    `- ${s.externalRecords.toLocaleString("en-US")} external records across ${s.externalFrameworks} frameworks.\n` +
    `- ${s.topicToExternalLinks.toLocaleString("en-US")} topic-to-standard links, covering ${s.externalRecordsLinked.toLocaleString("en-US")} unique external records.\n` +
    `- ${s.externalRecordsUnlinked.toLocaleString("en-US")} external records are retained as unmapped references.\n\n` +
    `## Imported-record coverage\n\n` +
    `| Framework | Records | Linked records | Unlinked records | Topic links | Text copied by ASFAI |\n` +
    `|---|---:|---:|---:|---:|---|\n${rows}\n\n` +
    `## Findings\n\n${findings}\n\n` +
    `## Interpretation\n\n` +
    `This release is a complete mechanical conversion of the available source graph, not a claim that all records are pedagogically final. ` +
    `The ASFAI IDs are permanent, but statements, evidence expectations, prerequisites, and mappings remain versioned and reviewable. ` +
    `A learner record should cite the objective URI and framework version used when evidence was evaluated.\n`;
}

function assertSourceSnapshot({ topicsFile, dependenciesFile, curriculaFile, marbleManifest }) {
  const expected = {
    topicsFile: "2d99fc3b5e57d9ddb86b6c179b58a1b0390f048d9798585fe03b13cbc183719b",
    dependenciesFile: "86a24efb44b480e5be23082b4bdea653f69f6d6fd54c5409a2f33c185be1d87f",
    curriculaFile: "33a835abaafa68ed736f2102d5502ff030d6448dc55ae45718be05a78f5fc73f"
  };
  for (const [key, expectedHash] of Object.entries(expected)) {
    const actual = sha256(normalizeNewlines({ topicsFile, dependenciesFile, curriculaFile }[key]));
    if (actual !== expectedHash) fail(`Unexpected Marble ${key} hash: ${actual}; expected ${expectedHash}`);
  }
  if (marbleManifest.taxonomyVersion !== "v1") fail(`Unexpected Marble taxonomy version ${marbleManifest.taxonomyVersion}`);
}

function objectiveStatement(topic) {
  const description = topic.description.trim().replace(/[;:]$/, ".");
  const punctuatedDescription = /[.!?]$/.test(description) ? description : `${description}.`;
  return `Demonstrate the “${topic.name}” objective: ${punctuatedDescription}`;
}

function findCycles(topics, dependencies) {
  const adjacency = new Map(topics.map((topic) => [topic.id, []]));
  for (const edge of dependencies) {
    if (adjacency.has(edge.prerequisiteId)) adjacency.get(edge.prerequisiteId).push(edge.topicId);
  }
  const indexByNode = new Map();
  const lowLinkByNode = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];
  let index = 0;

  function visit(node) {
    indexByNode.set(node, index);
    lowLinkByNode.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!indexByNode.has(neighbor)) {
        visit(neighbor);
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), lowLinkByNode.get(neighbor)));
      } else if (onStack.has(neighbor)) {
        lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), indexByNode.get(neighbor)));
      }
    }
    if (lowLinkByNode.get(node) === indexByNode.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) cycles.push(component.sort());
    }
  }

  for (const topic of topics) {
    if (!indexByNode.has(topic.id)) visit(topic.id);
  }
  return cycles;
}

function duplicateValues(records, selector) {
  const values = new Map();
  for (const record of records) {
    const value = selector(record);
    values.set(value, [...(values.get(value) ?? []), record.id]);
  }
  return new Map([...values].filter(([value, ids]) => value && ids.length > 1));
}

function countBy(records, selector) {
  return Object.fromEntries(
    [...records.reduce((map, record) => {
      const key = selector(record);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map())].sort(([a], [b]) => a.localeCompare(b))
  );
}

function readOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonLines(records) {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function csv(records) {
  const headers = Object.keys(records[0] ?? {});
  return `${[
    headers.join(","),
    ...records.map((record) => headers.map((header) => csvCell(record[header])).join(","))
  ].join("\n")}\n`;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function uuidV5(name, namespaceUuid) {
  const namespace = Buffer.from(namespaceUuid.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(namespace).update(name, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
