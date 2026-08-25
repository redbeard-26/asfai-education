import type { ArtifactResult } from "@/lib/lessons/artifact-relay";
import type { EvidenceObservation } from "@/lib/lessons/schemas";

const OBJECTIVES = {
  structure: "urn:asfai:objective:block-algebra:polynomial-structure",
  factoring: "urn:asfai:objective:block-algebra:factor-area-model",
  unlikeTerms: "urn:asfai:objective:block-algebra:unlike-terms",
  completeSquare: "urn:asfai:objective:block-algebra:complete-square",
} as const;

export interface SuggestedJudgement {
  objectiveId: string;
  observationIndexes: number[];
  level: "emerging" | "developing" | "proficient";
  confidence: number;
  rationale: string;
}

interface NormalizedArtifactEvidence {
  observations: EvidenceObservation[];
  suggestedJudgements: SuggestedJudgement[];
  caveats: string[];
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function observation(
  result: ArtifactResult,
  activityId: string,
  objectiveId: string,
  summary: string,
  observedEvidence: string[],
  validityFlags: string[] = [],
): EvidenceObservation {
  return {
    objectiveId,
    activityId,
    evidenceType: "game-telemetry",
    summary,
    observedEvidence,
    result: result.summary,
    assistance: "unknown",
    observer: { type: "deterministic", system: result.source, version: result.version },
    validityFlags,
    occurredAt: result.completedAt,
  };
}

function normalizeWalkthrough(result: ArtifactResult, activityId: string): NormalizedArtifactEvidence {
  const levels = records(result.summary.perLevel);
  const failures = record(result.summary.failureReasons);
  const observations: EvidenceObservation[] = [];
  const suggestedJudgements: SuggestedJudgement[] = [];
  const firstThree = levels.slice(0, 3);
  if (firstThree.some((level) => level.completed === true)) {
    const completed = firstThree.filter((level) => level.completed === true).length;
    const clean = completed === 3 && firstThree.every((level) => number(level.attemptsToComplete) <= 2);
    observations.push(observation(
      result,
      activityId,
      OBJECTIVES.structure,
      `Completed ${completed} of the three polynomial-representation levels${clean ? " with no more than two attempts each" : ""}.`,
      [
        `${completed}/3 representation levels completed`,
        `wrong_counts failures: ${number(failures.wrong_counts)}`,
      ],
    ));
    suggestedJudgements.push({
      objectiveId: OBJECTIVES.structure,
      observationIndexes: [observations.length - 1],
      level: clean && number(failures.wrong_counts) === 0 ? "proficient" : completed === 3 ? "developing" : "emerging",
      confidence: clean ? 0.72 : 0.55,
      rationale: "The walkthrough records deliberate Check attempts, but game telemetry should be combined with explanation or transfer evidence.",
    });
  }

  const factorLevels = [3, 4, 5, 6, 8, 9].map((index) => levels[index]).filter(Boolean);
  if (factorLevels.some((level) => level.completed === true)) {
    const completed = factorLevels.filter((level) => level.completed === true).length;
    const core = factorLevels.slice(0, 4);
    const coreClean = core.length === 4 && core.every((level) => level.completed === true && number(level.attemptsToComplete) <= 2);
    observations.push(observation(
      result,
      activityId,
      OBJECTIVES.factoring,
      `Completed ${completed} of six factorization levels; ${core.filter((level) => level.completed === true).length} of four core levels were completed.`,
      [
        `${completed}/6 factorization levels completed`,
        `gaps failures: ${number(failures.gaps)}`,
        `ragged failures: ${number(failures.ragged)}`,
      ],
      ["Area-model game evidence does not by itself establish symbolic transfer."],
    ));
    suggestedJudgements.push({
      objectiveId: OBJECTIVES.factoring,
      observationIndexes: [observations.length - 1],
      level: coreClean ? "proficient" : completed >= 3 ? "developing" : "emerging",
      confidence: coreClean ? 0.7 : 0.52,
      rationale: "Deliberate rectangle submissions provide acquisition evidence; symbolic transfer and reasoning should be assessed separately.",
    });
  }

  const square = levels[7];
  if (square && (square.completed === true || number(square.attempts) > 0)) {
    observations.push(observation(
      result,
      activityId,
      OBJECTIVES.completeSquare,
      square.completed === true
        ? `Completed the complete-square level in ${number(square.attemptsToComplete)} attempt(s).`
        : "Attempted the complete-square level without completing it.",
      [
        `completed: ${square.completed === true}`,
        `attempts: ${number(square.attempts)}`,
        `not_square failures: ${number(failures.not_square)}`,
      ],
      ["The summary does not retain the full added-unit attempt sequence; use standard event data or an explanation for stronger interpretation."],
    ));
    if (square.completed === true) {
      suggestedJudgements.push({
        objectiveId: OBJECTIVES.completeSquare,
        observationIndexes: [observations.length - 1],
        level: number(square.attemptsToComplete) <= 2 ? "proficient" : "developing",
        confidence: number(square.attemptsToComplete) <= 2 ? 0.65 : 0.5,
        rationale: "Successful geometry is positive evidence, but the learner should explain how the constant was determined.",
      });
    }
  }

  if (number(failures.wrong_counts) > 0) {
    observations.push(observation(
      result,
      activityId,
      OBJECTIVES.unlikeTerms,
      `The walkthrough recorded ${number(failures.wrong_counts)} wrong-count attempt(s), which identifies a possible unlike-term misconception for follow-up.`,
      [`wrong_counts failures: ${number(failures.wrong_counts)}`],
      ["A failure signature is diagnostic context, not proof that the learner lacks the objective."],
    ));
  }

  return {
    observations,
    suggestedJudgements,
    caveats: [
      "Pilot thresholds are provisional.",
      "Overlap failures and resets may reflect mechanics rather than algebra.",
      "Use explanation and symbolic transfer before a mastery claim.",
    ],
  };
}

function normalizeDrop(result: ArtifactResult, activityId: string, practice: boolean): NormalizedArtifactEvidence {
  const tiers = records(result.summary.tiers);
  const duration = number(result.summary.durationS);
  const offered = tiers.reduce((sum, tier) => sum + number(tier.targetsOffered), 0);
  const qualifying = duration >= 360 || offered >= 10;
  const caveats = [
    "Speed and weak performance may reflect dexterity, stress, or board conditions.",
    "Only constructed, non-chain clears are interpreted as fluency evidence.",
    "Pilot thresholds are provisional and must not be used for consequential decisions.",
  ];
  if (practice) {
    return {
      observations: [],
      suggestedJudgements: [],
      caveats: ["This launch was designated as practice; its telemetry is not used for proficiency claims.", ...caveats],
    };
  }
  if (!qualifying) {
    return {
      observations: [],
      suggestedJudgements: [],
      caveats: [`The round did not reach six minutes or ten offered targets (${Math.round(duration)} seconds, ${offered} targets).`, ...caveats],
    };
  }

  const observations: EvidenceObservation[] = [];
  const suggestedJudgements: SuggestedJudgement[] = [];
  const tierA = tiers.find((tier) => number(tier.tier) === 0) ?? {};
  const tierB = tiers.find((tier) => number(tier.tier) === 1) ?? {};
  const tierC = tiers.find((tier) => number(tier.tier) === 2) ?? {};
  const lo1Constructed = number(tierA.constructedClears) + number(tierB.constructedClears);
  if (lo1Constructed > 0) {
    const proficient = number(tierA.clearRatePerTarget) >= 0.6 && number(tierB.clearRatePerTarget) >= 0.4;
    observations.push(observation(
      result,
      activityId,
      OBJECTIVES.structure,
      `Recorded ${lo1Constructed} constructed tier A/B clear(s) across ${offered} offered targets.`,
      [
        `tier A constructed clear rate: ${number(tierA.clearRatePerTarget)}`,
        `tier B constructed clear rate: ${number(tierB.clearRatePerTarget)}`,
      ],
      caveats,
    ));
    suggestedJudgements.push({
      objectiveId: OBJECTIVES.structure,
      observationIndexes: [observations.length - 1],
      level: proficient ? "proficient" : number(tierB.constructedClears) >= 1 ? "developing" : "emerging",
      confidence: proficient ? 0.6 : 0.45,
      rationale: "Constructed clears support fluency, with speed and arcade-control confounds retained as caveats.",
    });
  }
  const distinct = Array.isArray(result.summary.distinctQuadraticsConstructed)
    ? result.summary.distinctQuadraticsConstructed.length
    : 0;
  if (number(tierC.constructedClears) > 0) {
    const proficient = number(tierC.constructedClears) >= 3 && distinct >= 2;
    observations.push(observation(
      result,
      activityId,
      OBJECTIVES.factoring,
      `Recorded ${number(tierC.constructedClears)} constructed quadratic clear(s) across ${distinct} distinct polynomial(s).`,
      [
        `constructed quadratic clears: ${number(tierC.constructedClears)}`,
        `distinct constructed quadratics: ${distinct}`,
        `median constructed time-to-clear: ${number(tierC.medianTtcConstructedS)} seconds`,
      ],
      caveats,
    ));
    suggestedJudgements.push({
      objectiveId: OBJECTIVES.factoring,
      observationIndexes: [observations.length - 1],
      level: proficient ? "proficient" : "developing",
      confidence: proficient ? 0.62 : 0.48,
      rationale: "Constructed quadratic clears support area-model fluency; symbolic transfer remains a separate requirement.",
    });
  }
  return { observations, suggestedJudgements, caveats };
}

export function normalizeBlockAlgebraResult(
  result: ArtifactResult,
  activityId: string,
  practice = false,
): NormalizedArtifactEvidence {
  if (result.source === "block-algebra-puzzle") return normalizeWalkthrough(result, activityId);
  if (result.source === "block-algebra-drop") return normalizeDrop(result, activityId, practice);
  throw new Error(`Unsupported Block Algebra artifact '${result.source}'.`);
}
