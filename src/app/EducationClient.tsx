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
import { masteredIds, type LearnerProfile, type LearnerStore } from "@/lib/learner-store/types";

export default function EducationClient() {
  const localStore = useMemo(() => new IndexedDbLearnerStore(), []);
  const [store, setStore] = useState<LearnerStore>(localStore);
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [podRoot, setPodRoot] = useState("");
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [status, setStatus] = useState("Loading local learner profile…");

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

  const mastered = profile ? masteredIds(profile) : [];

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
