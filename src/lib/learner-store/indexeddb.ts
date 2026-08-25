"use client";

import {
  assertStoredProfileMatches,
  migrateLearnerProfile,
  newLearnerProfile,
  type AssessmentClaim,
  type EvidenceEvent,
  type LearnerObjectiveState,
  type LearnerProfile,
  type LearnerStore,
} from "./types";
import type { LessonReport, LessonRun } from "@/lib/lessons/schemas";

const DB_NAME = "asfai-education";
const DB_VERSION = 1;
const STORE = "learner-profile";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readProfile(): Promise<LearnerProfile | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as LearnerProfile | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function writeProfile(profile: LearnerProfile): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(profile, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  assertStoredProfileMatches(profile, await readProfile());
}

export class IndexedDbLearnerStore implements LearnerStore {
  readonly kind = "indexeddb" as const;

  async load(): Promise<LearnerProfile> {
    const existing = await readProfile();
    if (existing) {
      const migrated = migrateLearnerProfile(existing);
      if (existing.schemaVersion !== migrated.schemaVersion) await writeProfile(migrated);
      return migrated;
    }
    const profile = newLearnerProfile();
    await writeProfile(profile);
    return profile;
  }

  async save(profile: LearnerProfile): Promise<void> {
    await writeProfile(profile);
  }

  async appendEvidence(event: EvidenceEvent): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = { ...profile, updatedAt: new Date().toISOString(), evidence: [...profile.evidence, event] };
    await writeProfile(next);
    return next;
  }

  async appendAssessmentClaim(claim: AssessmentClaim): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = {
      ...profile,
      updatedAt: new Date().toISOString(),
      assessmentClaims: [...profile.assessmentClaims, claim],
    };
    await writeProfile(next);
    return next;
  }

  async putObjectiveState(state: LearnerObjectiveState): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = {
      ...profile,
      updatedAt: new Date().toISOString(),
      objectiveStates: { ...profile.objectiveStates, [state.objectiveId]: state },
    };
    await writeProfile(next);
    return next;
  }

  async putLessonRun(run: LessonRun): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = {
      ...profile,
      updatedAt: new Date().toISOString(),
      lessonRuns: { ...profile.lessonRuns, [run.id]: run },
    };
    await writeProfile(next);
    return next;
  }

  async putLessonReport(report: LessonReport): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = {
      ...profile,
      updatedAt: new Date().toISOString(),
      lessonReports: { ...profile.lessonReports, [report.id]: report },
    };
    await writeProfile(next);
    return next;
  }
}
