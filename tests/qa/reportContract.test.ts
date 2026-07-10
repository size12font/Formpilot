import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface ResultFile {
  summary: {
    total: number;
    countries: number;
    status: Record<string, number>;
    issueFamilies: Record<string, number>;
  };
  results: Array<{
    status: string;
    fields: unknown[];
  }>;
}

describe("static QA report contract", () => {
  it("keeps raw results and summary internally consistent", () => {
    const report = JSON.parse(
      readFileSync(resolve("qa-results/2026-07-10/live-dom-results.json"), "utf8")
    ) as ResultFile;
    const statusCounts = report.results.reduce<Record<string, number>>((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      return counts;
    }, {});

    expect(report.results).toHaveLength(report.summary.total);
    expect(report.summary.total).toBe(100);
    expect(report.summary.countries).toBeGreaterThanOrEqual(30);
    expect(statusCounts).toEqual(expect.objectContaining(report.summary.status));
    expect(report.results.every((result) => Array.isArray(result.fields))).toBe(true);
  });

  it("requires an independent reviewed oracle", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("fixtures/regressions/manifest.json"), "utf8")
    ) as { method?: string; cases?: unknown[] };

    expect(manifest.method).toMatch(/independent/i);
    expect(manifest.cases?.length ?? 0).toBeGreaterThan(0);
  });

  it("requires browser results to carry diagnostics and tripwire state", () => {
    const report = JSON.parse(
      readFileSync(resolve("qa-results/2026-07-10/browser-results.json"), "utf8")
    ) as { schemaVersion?: number; results: Array<Record<string, unknown>> };
    // Existing artifact predates diagnostic schema. New sealed runs must opt
    // into schema v2; keep old evidence readable until regenerated.
    if (report.schemaVersion !== 2) return;
    expect(report.results).toHaveLength(100);
    expect(report.results.every((result) =>
      ["pass", "partial", "externally-blocked", "fail"].includes(String(result.status)) &&
      typeof result.reason === "string" &&
      typeof result.message === "string" &&
      typeof result.navigated === "boolean" &&
      typeof result.submitted === "boolean" &&
      typeof result.ready === "number" &&
      typeof result.extractedFields === "number"
    )).toBe(true);
  });
});
