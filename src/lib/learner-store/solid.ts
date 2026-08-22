"use client";

import { createContainerAt, getFile, overwriteFile } from "@inrupt/solid-client";
import { Session } from "@inrupt/solid-client-authn-browser";
import {
  newLearnerProfile,
  type AssessmentClaim,
  type EvidenceEvent,
  type LearnerObjectiveState,
  type LearnerProfile,
  type LearnerStore,
} from "./types";

export const solidSession = new Session();
const CONFIG_KEY = "asfai-solid-config";

export interface SolidConfig {
  podRoot: string;
  oidcIssuer: string;
}

function withSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

export function saveSolidConfig(config: SolidConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadSolidConfig(): SolidConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? (JSON.parse(raw) as SolidConfig) : null;
}

export async function loginToSolid(config: SolidConfig) {
  saveSolidConfig(config);
  await solidSession.login({
    oidcIssuer: config.oidcIssuer,
    redirectUrl: window.location.href,
    clientName: "ASFAI Education",
  });
}

export async function restoreSolidSession() {
  await solidSession.handleIncomingRedirect({ restorePreviousSession: true });
  return solidSession.info.isLoggedIn;
}

export class SolidPodLearnerStore implements LearnerStore {
  readonly kind = "solid" as const;
  private readonly containerUrl: string;
  private readonly profileUrl: string;

  constructor(private readonly config: SolidConfig) {
    this.containerUrl = `${withSlash(config.podRoot)}asfai/`;
    this.profileUrl = `${this.containerUrl}learner.json`;
  }

  private get fetcher() {
    if (!solidSession.info.isLoggedIn) throw new Error("Solid session is not authenticated.");
    return solidSession.fetch;
  }

  private async ensureContainer() {
    try {
      await createContainerAt(this.containerUrl, { fetch: this.fetcher });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/409|already exists|405/i.test(message)) throw error;
    }
  }

  async load(): Promise<LearnerProfile> {
    try {
      const file = await getFile(this.profileUrl, { fetch: this.fetcher });
      return JSON.parse(await file.text()) as LearnerProfile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/404|not found/i.test(message)) throw error;
      const profile = newLearnerProfile();
      await this.save(profile);
      return profile;
    }
  }

  async save(profile: LearnerProfile): Promise<void> {
    await this.ensureContainer();
    const next = { ...profile, updatedAt: new Date().toISOString() };
    await overwriteFile(
      this.profileUrl,
      new Blob([JSON.stringify(next, null, 2)], { type: "application/json" }),
      { contentType: "application/json", fetch: this.fetcher },
    );
  }

  async appendEvidence(event: EvidenceEvent): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = { ...profile, evidence: [...profile.evidence, event] };
    await this.save(next);
    return { ...next, updatedAt: new Date().toISOString() };
  }

  async appendAssessmentClaim(claim: AssessmentClaim): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = { ...profile, assessmentClaims: [...profile.assessmentClaims, claim] };
    await this.save(next);
    return { ...next, updatedAt: new Date().toISOString() };
  }

  async putObjectiveState(state: LearnerObjectiveState): Promise<LearnerProfile> {
    const profile = await this.load();
    const next = {
      ...profile,
      objectiveStates: { ...profile.objectiveStates, [state.objectiveId]: state },
    };
    await this.save(next);
    return { ...next, updatedAt: new Date().toISOString() };
  }
}
