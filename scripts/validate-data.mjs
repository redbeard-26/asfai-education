import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DATA_DIR = join(REPO_ROOT, "data", "asfai-core-v0.1");
const DOMAIN = "https://education.asfai.org/";

const manifest = await readJson("manifest.json");
const framework = await readJson("framework.json");
const rubrics = await readJson("rubrics.json");
const casePackage = await readJson("case-1.1/package.json");
const evaluation = await readJson("reports/source-evaluation.json");
const objectives = await readJsonLines("objectives.jsonl");
const relationships = await readJsonLines("relationships.jsonl");
const alignments = await readJsonLines("alignments.jsonl");
const externalItems = await readJsonLines("external-items.jsonl");
const externalFrameworks = (await readJson("external-frameworks.json")).frameworks;

const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

for (const [path, expected] of Object.entries(manifest.files)) {
  const contents = await readFile(join(DATA_DIR, path));
  check(contents.length === expected.bytes, `${path}: byte count mismatch`);
  check(sha256(contents) === expected.sha256, `${path}: SHA-256 mismatch`);
}

check(manifest.canonicalBaseUri === "https://education.asfai.org", "Unexpected canonical base URI");
check(framework.id === manifest.frameworkId, "Framework and manifest IDs differ");
check(objectives.length === manifest.counts.objectives, "Objective count mismatch");
check(relationships.length === manifest.counts.relationships, "Relationship count mismatch");
check(alignments.length === manifest.counts.alignments, "Alignment count mismatch");
check(externalItems.length === manifest.counts.externalItems, "External item count mismatch");
check(externalFrameworks.length === manifest.counts.externalFrameworks, "External framework count mismatch");

const objectiveIds = uniqueSet(objectives, "id", errors);
uniqueSet(objectives, "uuid", errors);
uniqueSet(objectives, "humanCodingScheme", errors);
const relationshipIds = uniqueSet(relationships, "id", errors);
const alignmentIds = uniqueSet(alignments, "id", errors);
const externalItemIds = uniqueSet(externalItems, "id", errors);
const externalFrameworkIds = uniqueSet(externalFrameworks, "id", errors);

for (const objective of objectives) {
  check(objective.id.startsWith(`${DOMAIN}objectives/`), `${objective.id}: objective URI is outside the ASFAI namespace`);
  check(isUuid(objective.uuid), `${objective.id}: invalid UUID`);
  check(objective.frameworkId === framework.id, `${objective.id}: wrong framework`);
  check(objective.statement?.length > 0, `${objective.id}: missing statement`);
  check(objective.label?.length > 0, `${objective.id}: missing label`);
  check(objective.description?.length > 0, `${objective.id}: missing description`);
  check(objective.educationLevel.minimumAge <= objective.educationLevel.maximumAge, `${objective.id}: invalid age range`);
  check(objective.review.status === "unreviewed", `${objective.id}: bootstrap objective must remain unreviewed`);
  check(objective.provenance.sourceCommit === manifest.source.commit, `${objective.id}: source commit mismatch`);
  check(objective.provenance.sourceReferenceId.startsWith(`${DOMAIN}sources/marble/`), `${objective.id}: invalid Marble reference URI`);
}

const adjacency = new Map(objectives.map((objective) => [objective.id, []]));
const relationshipPairs = new Set();
for (const relationship of relationships) {
  check(relationship.id.startsWith(`${DOMAIN}associations/`), `${relationship.id}: relationship URI is outside the ASFAI namespace`);
  check(objectiveIds.has(relationship.fromObjectiveId), `${relationship.id}: unknown source objective`);
  check(objectiveIds.has(relationship.toObjectiveId), `${relationship.id}: unknown target objective`);
  check(relationship.fromObjectiveId !== relationship.toObjectiveId, `${relationship.id}: self dependency`);
  check(["hard", "soft"].includes(relationship.strength), `${relationship.id}: invalid dependency strength`);
  check(relationship.relationshipType === "prerequisiteOf", `${relationship.id}: invalid native relationship type`);
  check(relationship.caseAssociationType === "precedes", `${relationship.id}: invalid CASE relationship type`);
  const pair = `${relationship.fromObjectiveId}->${relationship.toObjectiveId}`;
  check(!relationshipPairs.has(pair), `${relationship.id}: duplicate dependency pair`);
  relationshipPairs.add(pair);
  adjacency.get(relationship.fromObjectiveId)?.push(relationship.toObjectiveId);
}
check(!hasDirectedCycle(adjacency), "Objective dependency graph contains a cycle");

for (const alignment of alignments) {
  check(alignment.id.startsWith(`${DOMAIN}alignments/`), `${alignment.id}: alignment URI is outside the ASFAI namespace`);
  check(objectiveIds.has(alignment.objectiveId), `${alignment.id}: unknown objective`);
  check(externalItemIds.has(alignment.targetId), `${alignment.id}: unknown external item`);
  check(externalFrameworkIds.has(alignment.targetFrameworkId), `${alignment.id}: unknown external framework`);
  check(alignment.relation === "relatedTo", `${alignment.id}: bootstrap alignment must not overstate match semantics`);
  check(alignment.review.status === "unreviewed", `${alignment.id}: bootstrap alignment must remain unreviewed`);
}

for (const item of externalItems) {
  check(item.id.startsWith(`${DOMAIN}frameworks/`), `${item.id}: external reference URI is outside the ASFAI namespace`);
  check(externalFrameworkIds.has(item.frameworkId), `${item.id}: unknown external framework`);
  check(item.textIncludedInAsfaiPackage === false, `${item.id}: third-party standard text must not be included`);
  check(!("data" in item) && !("description" in item) && !("title" in item), `${item.id}: copied external text detected`);
}

const calculatedLinksByItem = new Map(externalItems.map((item) => [item.id, 0]));
for (const alignment of alignments) calculatedLinksByItem.set(alignment.targetId, calculatedLinksByItem.get(alignment.targetId) + 1);
for (const item of externalItems) {
  check(item.linkedObjectiveCount === calculatedLinksByItem.get(item.id), `${item.id}: linked objective count mismatch`);
}

check(rubrics.rubrics.length === 1, "Expected one default rubric");
check(casePackage.document.uri === framework.id, "CASE document URI mismatch");
check(casePackage.document.caseVersion === "1.1", "CASE version must be 1.1");
check(casePackage.items.length === objectives.length, "CASE item count mismatch");
check(casePackage.associations.length === relationships.length + alignments.length, "CASE association count mismatch");
check(casePackage.rubrics.length === rubrics.rubrics.length, "CASE rubric count mismatch");
check(uniqueSet(casePackage.items, "uri", errors).size === objectives.length, "CASE item URIs are not unique");
check(uniqueSet(casePackage.associations, "uri", errors).size === relationships.length + alignments.length, "CASE association URIs are not unique");
check(evaluation.summary.generatedObjectives === objectives.length, "Evaluation objective count mismatch");
check(evaluation.summary.externalRecords === externalItems.length, "Evaluation external item count mismatch");

for (const id of [...objectiveIds, ...relationshipIds, ...alignmentIds, ...externalItemIds, ...externalFrameworkIds]) {
  check(id.startsWith(DOMAIN), `${id}: non-ASFAI canonical identifier`);
}

if (errors.length) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
  if (errors.length > 100) console.error(`- ... ${errors.length - 100} more`);
  process.exit(1);
}

console.log(JSON.stringify({
  valid: true,
  framework: framework.id,
  counts: manifest.counts,
  caseAssociations: casePackage.associations.length,
  dependencyGraphAcyclic: true,
  externalStandardTextIncluded: false
}, null, 2));

async function readJson(path) {
  return JSON.parse(await readFile(join(DATA_DIR, path), "utf8"));
}

async function readJsonLines(path) {
  return (await readFile(join(DATA_DIR, path), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function uniqueSet(records, key, errors) {
  const values = new Set();
  for (const record of records) {
    const value = record[key];
    if (!value) errors.push(`Missing ${key}`);
    if (values.has(value)) errors.push(`Duplicate ${key}: ${value}`);
    values.add(value);
  }
  return values;
}

function hasDirectedCycle(adjacency) {
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return [...adjacency.keys()].some(visit);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
