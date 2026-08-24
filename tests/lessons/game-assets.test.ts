import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const assets = [
  "public/artifacts/block-algebra/1.0.0/walkthrough/index.html",
  "public/artifacts/block-algebra/1.0.0/drop/index.html",
];

describe("Block Algebra artifact hardening", () => {
  for (const relative of assets) {
    it(`${path.basename(path.dirname(relative))} uses an opaque launch and a bounded relay`, () => {
      const source = fs.readFileSync(relative, "utf8");
      expect(source).not.toContain("qs.get('learner')");
      expect(source).not.toContain("navigator.userAgent");
      expect(source).not.toMatch(/postMessage\([^\n]+,\s*['"]\*['"]\)/);
      expect(source).not.toContain("user-scalable=no");
      expect(source).toContain("/education/api/artifact-results");
      expect(source).toContain("parentOrigin");
    });
  }

  it("records addedOnes on failed complete-square attempts", () => {
    const source = fs.readFileSync(assets[0], "utf8");
    expect(source).toContain("attempt(false,r.reason,{ addedOnes:c })");
  });
});
