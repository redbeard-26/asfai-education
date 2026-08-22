"use client";

import { useEffect, useMemo, useState } from "react";
import { IndexedDbLearnerStore } from "@/lib/learner-store/indexeddb";
import {
  SolidPodLearnerStore,
  loadSolidConfig,
  loginToSolid,
  restoreSolidSession,
  solidSession,
} from "@/lib/learner-store/solid";
import {
  masteredIds,
  type LearnerProfile,
  type LearnerStore,
} from "@/lib/learner-store/types";

interface Objective {
  id: string;
  name: string;
  subject: string;
  domain: string;
  description: string;
  evidence: string[];
  assessmentPrompt: string;
}

interface ObjectiveLink {
  id: string;
  name: string;
  strength: "hard" | "soft";
  reason: string;
}

interface Neighborhood {
  objective: Objective;
  prerequisites: ObjectiveLink[];
  unlocks: ObjectiveLink[];
}

const API = "/education/api/objectives";

export default function EducationClient() {
  const localStore = useMemo(() => new IndexedDbLearnerStore(), []);
  const [store, setStore] = useState<LearnerStore>(localStore);
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [podRoot, setPodRoot] = useState("");
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [status, setStatus] = useState("Loading local learner profile…");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Objective[]>([]);
  const [selected, setSelected] = useState<Neighborhood | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = loadSolidConfig();
      if (saved) {
        setPodRoot(saved.podRoot);
        setOidcIssuer(saved.oidcIssuer);
      }
      const loggedIn = await restoreSolidSession();
      if (loggedIn && saved) {
        const solid = new SolidPodLearnerStore(saved);
        setStore(solid);
        setProfile(await solid.load());
        setStatus(`Using Solid Pod${solidSession.info.webId ? ` as ${solidSession.info.webId}` : ""}.`);
        return;
      }
      const local = await localStore.load();
      setProfile(local);
      setStatus("Using IndexedDB on this browser. No ASFAI account is required.");
    })();
  }, [localStore]);

  async function connectPod() {
    if (!podRoot || !oidcIssuer) {
      setStatus("Enter both the Pod root URL and OIDC issuer.");
      return;
    }
    setStatus("Redirecting to your Solid identity provider…");
    await loginToSolid({ podRoot, oidcIssuer });
  }

  async function copyLocalToPod() {
    const config = loadSolidConfig();
    if (!config || !solidSession.info.isLoggedIn) {
      setStatus("Connect to the Solid Pod first.");
      return;
    }
    const local = await localStore.load();
    const solid = new SolidPodLearnerStore(config);
    await solid.save(local);
    setStore(solid);
    setProfile(await solid.load());
    setStatus("Copied the local learner profile to the Solid Pod and switched cloud storage on.");
  }

  async function useLocal() {
    setStore(localStore);
    setProfile(await localStore.load());
    setStatus("Using IndexedDB on this browser.");
  }

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`${API}?q=${encodeURIComponent(query)}&limit=20`);
      setResults((await response.json()) as Objective[]);
    } finally {
      setSearching(false);
    }
  }

  async function openObjective(id: string) {
    const response = await fetch(`${API}?mode=neighbors&id=${encodeURIComponent(id)}`);
    if (response.ok) setSelected((await response.json()) as Neighborhood);
  }

  async function startLearning(objective: Objective) {
    if (!profile) return;
    const state = {
      objectiveId: objective.id,
      level: "developing" as const,
      supportingEvidenceCount: profile.objectiveStates[objective.id]?.supportingEvidenceCount ?? 0,
      claimIds: profile.objectiveStates[objective.id]?.claimIds ?? [],
      lastObservedAt: new Date().toISOString(),
      policyVersion: "self-directed-v0.1",
    };
    setProfile(await store.putObjectiveState(state));
    setStatus(`Tracking ${objective.name} as in progress in ${store.kind === "solid" ? "your Solid Pod" : "IndexedDB"}.`);
  }

  async function recordSelfAssessedMastery(objective: Objective) {
    if (!profile) return;
    const now = new Date().toISOString();
    const evidenceId = `urn:uuid:${crypto.randomUUID()}`;
    const claimId = `urn:uuid:${crypto.randomUUID()}`;
    let next = await store.appendEvidence({
      id: evidenceId,
      learnerId: profile.learnerId,
      objectiveId: objective.id,
      occurredAt: now,
      verb: "self-assessed-mastery",
      result: { selfReported: true },
      source: { system: "asfai-education", version: "0.1.0" },
    });
    next = await store.appendAssessmentClaim({
      id: claimId,
      learnerId: profile.learnerId,
      objectiveId: objective.id,
      evidenceIds: [evidenceId],
      level: "mastered",
      confidence: 0.5,
      rationale: "Learner self-assessed this objective as mastered; independent evidence has not yet been established.",
      assessor: { type: "human", system: "learner-self-assessment" },
      createdAt: now,
      supersedes: null,
    });
    next = await store.putObjectiveState({
      objectiveId: objective.id,
      level: "mastered",
      confidence: 0.5,
      supportingEvidenceCount: 1,
      independentEvidenceCount: 0,
      lastObservedAt: now,
      claimIds: [claimId],
      policyVersion: "self-directed-v0.1",
    });
    setProfile(next);
    setStatus(`Recorded self-assessed mastery of ${objective.name}.`);
  }

  const mastered = profile ? masteredIds(profile) : [];
  const selectedLevel = selected && profile ? profile.objectiveStates[selected.objective.id]?.level : undefined;

  return (
    <section className="panel-grid">
      <article className="card">
        <h2>Learner-owned progress</h2>
        <p>{status}</p>
        {profile && (
          <dl>
            <div><dt>Learner ID</dt><dd>{profile.learnerId}</dd></div>
            <div><dt>Storage</dt><dd>{store.kind === "indexeddb" ? "IndexedDB" : "Solid Pod"}</dd></div>
            <div><dt>Mastered objectives</dt><dd>{mastered.length}</dd></div>
            <div><dt>Evidence events</dt><dd>{profile.evidence.length}</dd></div>
          </dl>
        )}
        <button onClick={useLocal}>Use this browser</button>
      </article>

      <article className="card">
        <h2>PrivateDataPod / Solid</h2>
        <p>Authorize ASFAI Education to store the same portable learner profile in your own Solid Pod.</p>
        <label>
          Pod root URL
          <input value={podRoot} onChange={(e) => setPodRoot(e.target.value)} placeholder="https://your-pod.example/" />
        </label>
        <label>
          OIDC issuer
          <input value={oidcIssuer} onChange={(e) => setOidcIssuer(e.target.value)} placeholder="https://identity-provider.example/" />
        </label>
        <div className="actions">
          <button onClick={connectPod}>Connect Solid Pod</button>
          <button onClick={copyLocalToPod} disabled={!solidSession.info.isLoggedIn}>Copy local progress to Pod</button>
        </div>
      </article>

      <article className="card wide">
        <h2>Explore learning objectives</h2>
        <div className="search-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="Search algebra, photosynthesis, programming…"
          />
          <button onClick={search} disabled={searching}>{searching ? "Searching…" : "Search"}</button>
        </div>
        {results.length > 0 && (
          <ul className="objective-list">
            {results.map((objective) => (
              <li key={objective.id}>
                <button className="objective-link" onClick={() => openObjective(objective.id)}>
                  <strong>{objective.name}</strong>
                  <span>{objective.subject} · {objective.domain}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="objective-detail">
            <p className="eyebrow">{selected.objective.subject} · {selected.objective.domain}</p>
            <h3>{selected.objective.name}</h3>
            <p>{selected.objective.description}</p>
            {selectedLevel && <p><strong>Current state:</strong> {selectedLevel}</p>}
            <div className="actions">
              <button onClick={() => startLearning(selected.objective)}>Start learning</button>
              <button onClick={() => recordSelfAssessedMastery(selected.objective)}>Record self-assessed mastery</button>
            </div>
            <div className="neighbor-grid">
              <div>
                <h4>Prerequisites</h4>
                <ul>{selected.prerequisites.map((link) => <li key={`${link.id}-${link.strength}`}><button className="text-button" onClick={() => openObjective(link.id)}>{link.name}</button> <small>{link.strength}</small></li>)}</ul>
              </div>
              <div>
                <h4>Unlocks</h4>
                <ul>{selected.unlocks.map((link) => <li key={`${link.id}-${link.strength}`}><button className="text-button" onClick={() => openObjective(link.id)}>{link.name}</button> <small>{link.strength}</small></li>)}</ul>
              </div>
            </div>
          </div>
        )}
      </article>

      <article className="card wide">
        <h2>Education MCP</h2>
        <p>
          The education server exposes only public graph operations: objective search, neighbors, program objectives,
          learning frontier, and prerequisite paths. Private progress stays in IndexedDB or the learner's Pod and is
          supplied to graph tools only as the minimum objective IDs needed for a calculation.
        </p>
        <code>/education/api/mcp</code>
      </article>
    </section>
  );
}
