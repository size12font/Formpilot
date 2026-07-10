import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path;
  });
}

describe("runtime network guard", () => {
  it("does not use fetch or XMLHttpRequest in src", () => {
    const offenders = files(join(process.cwd(), "src")).filter((path) => {
      const text = readFileSync(path, "utf8");
      return /\bfetch\s*\(|\bXMLHttpRequest\b/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
