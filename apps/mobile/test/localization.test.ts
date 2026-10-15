import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const expo = read("../app.json").expo;

// iOS gives an app the system language only when the bundle declares that language.
// Without it, Locale.current (and so Hermes Intl, which `src/ui/strings.ts` reads) stays English.
describe("system language", () => {
  it("declares Simplified Chinese so iOS hands the app a Chinese locale", () => {
    expect(expo.ios.infoPlist.CFBundleLocalizations).toEqual(["en", "zh-Hans"]);
    expect(expo.locales["zh-Hans"]).toBe("./locales/zh-Hans.json");
  });

  it("translates every iOS permission prompt the plugins declare", () => {
    const keyFor: Record<string, string> = {
      cameraPermission: "NSCameraUsageDescription",
      microphonePermission: "NSMicrophoneUsageDescription",
      photosPermission: "NSPhotoLibraryUsageDescription",
      speechRecognitionPermission: "NSSpeechRecognitionUsageDescription",
    };
    const declared = new Set<string>();
    for (const plugin of expo.plugins) {
      if (!Array.isArray(plugin)) continue;
      for (const option of Object.keys(plugin[1])) {
        if (option in keyFor) declared.add(keyFor[option]!);
      }
    }
    const zh = read("../locales/zh-Hans.json");
    expect(Object.keys(zh).sort()).toEqual([...declared].sort());
    for (const text of Object.values(zh)) expect(text).toMatch(/[一-鿿]/u);
  });
});
