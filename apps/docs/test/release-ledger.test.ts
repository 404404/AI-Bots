import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  composeReleaseLedgerPair,
  parseChangeFragment,
  parseReleaseLedger,
  validateReleaseLedger,
  validateReleaseLedgerPair,
} from "../../../scripts/release-ledger.mjs";

describe("DeepSeekBot release ledger", () => {
  it("parses Unreleased and dated SemVer releases through the canonical ledger seam", () => {
    const ledger = parseReleaseLedger(`# DeepSeekBot Changelog

## [Unreleased]

Make the next release easier to understand.

### Documentation

- Added the release-writing contract ([#100](https://github.com/BotHarness/BotHarness/issues/100)).

## [0.1.0] - 2026-09-20

Introduced the first installable DeepSeekBot preview.

### Added

- Added the PersonaBot roster ([#10](https://github.com/BotHarness/BotHarness/issues/10)).
`);

    expect(ledger.releases).toEqual([
      {
        identity: "Unreleased",
        date: undefined,
        summary: "Make the next release easier to understand.",
        sections: [
          {
            name: "Documentation",
            entries: [
              {
                text: "Added the release-writing contract ([#100](https://github.com/BotHarness/BotHarness/issues/100)).",
                links: ["https://github.com/BotHarness/BotHarness/issues/100"],
              },
            ],
          },
        ],
      },
      {
        identity: "0.1.0",
        date: "2026-09-20",
        summary: "Introduced the first installable DeepSeekBot preview.",
        sections: [
          {
            name: "Added",
            entries: [
              {
                text: "Added the PersonaBot roster ([#10](https://github.com/BotHarness/BotHarness/issues/10)).",
                links: ["https://github.com/BotHarness/BotHarness/issues/10"],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("rejects objective structural defects without judging prose quality", () => {
    const errors = validateReleaseLedger(`# DeepSeekBot Changelog

## [Unreleased]

### Highlights

- A launch note with no provenance.

### Security
`);

    expect(errors.map((error) => error.code)).toEqual([
      "missing-summary",
      "unknown-section",
      "missing-provenance",
      "empty-section",
    ]);
  });

  it("requires Unreleased first and rejects content that bypasses change validation", () => {
    const errors = validateReleaseLedger(`# DeepSeekBot Changelog

## [0.1.0] - 2026-09-20

Published the first preview.

### Added

This paragraph bypasses the change-entry contract.

- Added the PersonaBot roster ([#10](https://github.com/BotHarness/BotHarness/issues/10)).

## [Unreleased]

Preparing the next release.
`);

    expect(errors.map((error) => error.code)).toEqual([
      "unreleased-order",
      "unexpected-section-content",
    ]);
  });

  it("treats an indented Markdown continuation as part of its change entry", () => {
    const markdown = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the next release.

### Fixed

- Fixed release validation
  for translated entries ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
`;

    expect(validateReleaseLedger(markdown)).toEqual([]);
    expect(parseReleaseLedger(markdown).releases[0]?.sections[0]?.entries[0]).toEqual({
      text: "Fixed release validation for translated entries ([#100](https://github.com/BotHarness/BotHarness/issues/100)).",
      links: ["https://github.com/BotHarness/BotHarness/issues/100"],
    });
  });

  it("accepts SemVer prereleases and rejects invalid version or calendar date identities", () => {
    const valid = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the next stable release.

## [0.2.0-rc.1+build.5] - 2026-09-30

Published a testable prerelease.

- **Release tag:** [\`v0.2.0-rc.1+build.5\`](https://github.com/BotHarness/BotHarness/releases/tag/v0.2.0-rc.1+build.5)
- **Installable artifact:** [Download bundle](https://github.com/BotHarness/BotHarness/releases/download/v0.2.0-rc.1+build.5/deepseekbot.bundle)

### Added

- Added a preview capability ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
`;
    expect(validateReleaseLedger(valid)).toEqual([]);

    const nonGitHubTag = valid.replace(
      "https://github.com/BotHarness/BotHarness/releases/tag",
      "https://example.com/releases/tag",
    );
    expect(validateReleaseLedger(nonGitHubTag).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    const missingRepositoryTag = valid.replace(
      "https://github.com/BotHarness/BotHarness/releases/tag",
      "https://github.com/releases/tag",
    );
    expect(validateReleaseLedger(missingRepositoryTag).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    const wrongRepositoryTag = valid.replace(
      "https://github.com/BotHarness/BotHarness/releases/tag",
      "https://github.com/BotHarness/dsh-skill/releases/tag",
    );
    expect(validateReleaseLedger(wrongRepositoryTag).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    for (const invalidTagUrl of [
      valid.replace(
        "/releases/tag/v0.2.0-rc.1+build.5)",
        "/releases/tag/v0.2.0-rc.1+build.5?)",
      ),
      valid.replace(
        "/releases/tag/v0.2.0-rc.1+build.5)",
        "/releases/tag/v0.2.0-rc.1+build.5#)",
      ),
    ]) {
      expect(validateReleaseLedger(invalidTagUrl).map((error) => error.code)).toEqual([
        "missing-prerelease-evidence",
      ]);
    }

    const arbitraryInstallUrl = valid.replace(
      "https://github.com/BotHarness/BotHarness/releases/download/v0.2.0-rc.1+build.5/deepseekbot.bundle",
      "https://example.com/deepseekbot.bundle",
    );
    expect(validateReleaseLedger(arbitraryInstallUrl).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    const crossTagInstallUrl = valid.replace(
      "/releases/download/v0.2.0-rc.1+build.5/deepseekbot.bundle",
      "/releases/download/v0.2.0-rc.2/deepseekbot.bundle",
    );
    expect(validateReleaseLedger(crossTagInstallUrl).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    const crossRepositoryInstallUrl = valid.replace(
      "https://github.com/BotHarness/BotHarness/releases/download",
      "https://github.com/BotHarness/dsh-skill/releases/download",
    );
    expect(validateReleaseLedger(crossRepositoryInstallUrl).map((error) => error.code)).toEqual([
      "missing-prerelease-evidence",
    ]);

    for (const invalidInstallUrl of [
      valid.replace("deepseekbot.bundle)", "deepseekbot.bundle?download=1)"),
      valid.replace("deepseekbot.bundle)", "deepseekbot.bundle#download)"),
      valid.replace("deepseekbot.bundle)", "deepseekbot.bundle?)"),
      valid.replace("deepseekbot.bundle)", "deepseekbot.bundle#)"),
      valid.replace("/deepseekbot.bundle)", "/)"),
    ]) {
      expect(validateReleaseLedger(invalidInstallUrl).map((error) => error.code)).toEqual([
        "missing-prerelease-evidence",
      ]);
    }

    const invalid = valid.replace("0.2.0-rc.1+build.5", "01.2.0").replace(
      "2026-09-30",
      "2026-02-30",
    );
    expect(validateReleaseLedger(invalid).map((error) => error.code)).toEqual([
      "invalid-version",
      "invalid-date",
    ]);
  });

  it("accepts one dated Development summary without treating it as a release version", () => {
    const ledger = `# DeepSeekBot Changelog

## [Unreleased]

Preparing the first public release.

## [Development] - 2026-09-20

Consolidated the implemented work before the first release.

### Documentation

- Published the contributor docs ([#26](https://github.com/BotHarness/BotHarness/issues/26)).
`;

    expect(validateReleaseLedger(ledger)).toEqual([]);
    expect(parseReleaseLedger(ledger).releases.at(-1)).toMatchObject({
      identity: "Development",
      date: "2026-09-20",
    });
  });

  it("allows natural translation while enforcing bilingual release, section, and link parity", () => {
    const english = `# DeepSeekBot Changelog

## [Unreleased]

Make release history easier to scan.

### Documentation

- Added a concise writing contract ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
`;
    const chinese = `# DeepSeekBot 更新日志

## [Unreleased]

让读者更容易浏览发布历史。

### Documentation

- 新增简洁的写作规范（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。
`;

    expect(validateReleaseLedgerPair(english, chinese)).toEqual([]);

    const mismatched = chinese
      .replace("### Documentation", "### Changed")
      .replace("issues/100", "issues/99");
    expect(validateReleaseLedgerPair(english, mismatched).map((error) => error.code)).toEqual([
      "section-parity",
      "link-parity",
    ]);

    const extraEntry = `${chinese.trim()}\n- 再写一条指向同一票的内容（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。\n`;
    expect(validateReleaseLedgerPair(english, extraEntry).map((error) => error.code)).toEqual([
      "entry-parity",
    ]);

    const twoEnglishEntries = english.replace(
      "([#100](https://github.com/BotHarness/BotHarness/issues/100)).",
      "([#100](https://github.com/BotHarness/BotHarness/issues/100), [#99](https://github.com/BotHarness/BotHarness/issues/99)).\n- Added validation fixtures ([#98](https://github.com/BotHarness/BotHarness/issues/98)).",
    );
    const redistributedChineseLinks = chinese.replace(
      "（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。",
      "（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。\n- 新增验证样例（[#99](https://github.com/BotHarness/BotHarness/issues/99)、[#98](https://github.com/BotHarness/BotHarness/issues/98)）。",
    );
    expect(
      validateReleaseLedgerPair(twoEnglishEntries, redistributedChineseLinks).map(
        (error) => error.code,
      ),
    ).toEqual(["link-parity"]);
  });

  it("exposes actionable validation failures through the repository check command", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "botharness-release-ledger-"));
    const englishPath = resolve(directory, "CHANGELOG.md");
    const chinesePath = resolve(directory, "CHANGELOG.zh.md");
    try {
      writeFileSync(
        englishPath,
        `# DeepSeekBot Changelog\n\n## [Unreleased]\n\nSummary.\n\n### Added\n`,
      );
      writeFileSync(
        chinesePath,
        `# DeepSeekBot 更新日志\n\n## [Unreleased]\n\n摘要。\n\n### Added\n`,
      );

      const result = spawnSync(
        process.execPath,
        [resolve("scripts/check-release-ledger.mjs"), englishPath, chinesePath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "CHANGELOG.md [empty-section] Unreleased / Added must contain a change entry.",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const ISSUE = "https://github.com/BotHarness/BotHarness/issues/1552";
const fragment = (section: string, en: string, zh: string) =>
  `---\nsection: ${section}\n---\n\n## en\n\n- ${en} ([#1552](${ISSUE})).\n\n## zh\n\n- ${zh}（[#1552](${ISSUE})）。\n`;
const ledger = (title: string, summary: string, entry: string) =>
  `# ${title}\n\n## [Unreleased]\n\n${summary}\n\n### Added\n\n- ${entry} ([#1](https://github.com/BotHarness/BotHarness/issues/1)).\n\n## [0.1.0] - 2026-09-20\n\n${summary}\n\n### Added\n\n- ${entry} ([#1](https://github.com/BotHarness/BotHarness/issues/1)).\n`;

describe("Unreleased change fragments", () => {
  it("parses one bilingual fragment and rejects structural defects", () => {
    const parsed = parseChangeFragment(fragment("Fixed", "Fixed a thing", "修复了一个问题"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.section).toBe("Fixed");
    expect(parsed.english.map((entry) => entry.links)).toEqual([[ISSUE]]);
    expect(parsed.chinese).toHaveLength(1);

    const codes = (markdown: string) =>
      parseChangeFragment(markdown).errors.map((error) => error.code);
    expect(codes(fragment("Highlights", "A", "甲"))).toContain("unknown-section");
    expect(codes("## en\n\n- A ([#1](https://github.com/o/r/issues/1)).\n")).toEqual(
      expect.arrayContaining(["fragment-section", "empty-section"]),
    );
    expect(
      codes(
        `---\nsection: Added\n---\n\n## en\n\n- A ([#1](${ISSUE})).\n- B ([#1](${ISSUE})).\n\n## zh\n\n- 甲（[#1](${ISSUE})）。\n`,
      ),
    ).toContain("entry-parity");
    expect(
      codes(
        `---\nsection: Added\n---\n\n## en\n\n- A ([#1](${ISSUE})).\n\n## zh\n\n- 甲（[#2](https://github.com/o/r/pull/2)）。\n`,
      ),
    ).toContain("link-parity");
    expect(
      codes(`---\nsection: Added\n---\n\n## en\n\n- No link.\n\n## zh\n\n- 没有链接。\n`),
    ).toContain("missing-provenance");
  });

  it("appends fragments to their Unreleased sections and creates missing ones", () => {
    const composed = composeReleaseLedgerPair(
      ledger("DeepSeekBot Changelog", "Summary.", "Existing"),
      ledger("DeepSeekBot 更新日志", "摘要。", "已有"),
      [
        parseChangeFragment(fragment("Added", "Added B", "新增乙")),
        parseChangeFragment(fragment("Fixed", "Fixed C", "修复丙")),
      ],
    );

    expect(validateReleaseLedgerPair(composed.english, composed.chinese)).toEqual([]);
    const [unreleased, released] = parseReleaseLedger(composed.english).releases;
    expect(
      unreleased.sections.map((section) => [section.name, section.entries.map((e) => e.text)]),
    ).toEqual([
      [
        "Added",
        [
          "Existing ([#1](https://github.com/BotHarness/BotHarness/issues/1)).",
          `Added B ([#1552](${ISSUE})).`,
        ],
      ],
      ["Fixed", [`Fixed C ([#1552](${ISSUE})).`]],
    ]);
    expect(released.sections[0].entries).toHaveLength(1);
    expect(parseReleaseLedger(composed.chinese).releases[0].sections[1].name).toBe("Fixed");
  });

  it("checks fragments next to the ledgers and folds them in for a release", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "botharness-change-fragments-"));
    try {
      writeFileSync(resolve(directory, "CHANGELOG.md"), ledger("Changelog", "Summary.", "Existing"));
      writeFileSync(resolve(directory, "CHANGELOG.zh.md"), ledger("更新日志", "摘要。", "已有"));
      mkdirSync(resolve(directory, "changes"));
      writeFileSync(resolve(directory, "changes/README.md"), "# Not a fragment\n");
      writeFileSync(
        resolve(directory, "changes/1552-bad.md"),
        fragment("Highlights", "Bad", "坏"),
      );
      const run = (script: string, args: string[]) =>
        spawnSync(process.execPath, [resolve(script), ...args], {
          cwd: directory,
          encoding: "utf8",
        });
      const ledgers = [resolve(directory, "CHANGELOG.md"), resolve(directory, "CHANGELOG.zh.md")];

      const rejected = run("scripts/check-release-ledger.mjs", ledgers);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain("[unknown-section] Highlights is not an allowed");
      expect(run("scripts/fold-change-fragments.mjs", [directory]).status).toBe(1);
      expect(existsSync(resolve(directory, "changes/1552-bad.md"))).toBe(true);

      rmSync(resolve(directory, "changes/1552-bad.md"));
      writeFileSync(
        resolve(directory, "changes/1552-good.md"),
        fragment("Fixed", "Fixed C", "修复丙"),
      );
      const accepted = run("scripts/check-release-ledger.mjs", ledgers);
      expect(accepted.stdout).toContain("valid (1 Unreleased change fragments)");

      const folded = run("scripts/fold-change-fragments.mjs", [directory]);
      expect(folded.status).toBe(0);
      expect(existsSync(resolve(directory, "changes/1552-good.md"))).toBe(false);
      expect(existsSync(resolve(directory, "changes/README.md"))).toBe(true);
      expect(readFileSync(resolve(directory, "CHANGELOG.zh.md"), "utf8")).toContain(
        "### Fixed\n\n- 修复丙",
      );
      expect(run("scripts/check-release-ledger.mjs", ledgers).stdout).toContain(
        "valid (0 Unreleased change fragments)",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
