import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { installSpec, renderInstallGuidance, syncInstallGuidance } from "../../../scripts/sync-install-guidance.mjs";

describe("published stable install guidance", () => {
  it("updates installation specs without rewriting product identity or historical versions", () => {
    const text = "enter `deepseekbot`\n输入 `deepseekbot@1.2.0`\ndsh plugin --profile web add deepseekbot\nnpm pack deepseekbot\n```text\ndeepseekbot\n```\nThe `deepseekbot` package; historical `deepseekbot@1.2.0`.";
    const result = renderInstallGuidance(text, "1.2.1");
    expect(result).toContain("enter `deepseekbot@1.2.1`");
    expect(result).toContain("输入 `deepseekbot@1.2.1`");
    expect(result).toContain("add deepseekbot@1.2.1");
    expect(result).toContain("npm pack deepseekbot@1.2.1");
    expect(result).toContain("\ndeepseekbot@1.2.1\n");
    expect(result).toContain("historical `deepseekbot@1.2.0`");
    expect(renderInstallGuidance(result, "1.2.1")).toBe(result);
    expect(renderInstallGuidance(result, "1.2.2")).toContain("add deepseekbot@1.2.2");
    expect(renderInstallGuidance("add deepseekbot@latest", "1.2.1")).toBe("add deepseekbot@1.2.1");
  });

  it("rejects latest, ranges and prerelease identities", () => {
    for (const version of ["latest", "^1.2.1", "1.3.0-rc.1", "01.2.1"]) {
      expect(() => installSpec(version)).toThrow();
    }
  });

  it("keeps both READMEs and canonical guides synchronized", () => {
    expect(() => syncInstallGuidance(fileURLToPath(new URL("../../../", import.meta.url)), true)).not.toThrow();
  });
});
