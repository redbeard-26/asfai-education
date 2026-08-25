import { describe, expect, it } from "vitest";
import {
  createCollection,
  createResource,
  deleteResource,
  newEducatorWorkspace,
  setResourceStatus,
  updateCollection,
  versionResource,
} from "@/lib/capabilities/workspace";

describe("portable educator workspace", () => {
  it("versions resources without overwriting earlier content", () => {
    const initial = newEducatorWorkspace("educator-1");
    const created = createResource(initial, { title: "Lesson", content: { text: "v1" }, capabilityId: "T48" });
    const versioned = versionResource(created.workspace, created.resource.id, { content: { text: "v2" } });
    expect(versioned.resource.parentVersionId).toBe(created.resource.id);
    expect(versioned.resource.version).toBe(2);
    expect(versioned.workspace.resources[created.resource.id].content).toEqual({ text: "v1" });
    expect(versioned.workspace.resources[versioned.resource.id].content).toEqual({ text: "v2" });
  });

  it("supports publication, scoped sharing, revocation, and deletion", () => {
    const created = createResource(newEducatorWorkspace("educator-1"), { title: "Quiz", kind: "quiz", content: [] });
    const published = setResourceStatus(created.workspace, created.resource.id, "published");
    const collection = createCollection(published.workspace, { title: "Unit", resourceIds: [created.resource.id] });
    const shared = updateCollection(collection.workspace, collection.collection.id, { visibility: "shared" });
    expect(shared.collection.shareToken).toBeTruthy();
    const revoked = updateCollection(shared.workspace, collection.collection.id, { revoke: true });
    expect(revoked.collection.visibility).toBe("private");
    expect(revoked.collection.shareToken).toBeUndefined();
    const deleted = deleteResource(revoked.workspace, created.resource.id);
    expect(deleted.workspace.collections[collection.collection.id].resourceIds).toEqual([]);
  });
});
