import { test, expect } from "./fixtures";
import { readFile, writeFile } from "node:fs/promises";

type Readiness =
  | "no-profile"
  | "no-readable-document"
  | "no-fillable-fields"
  | "safe-partial"
  | "preview-ready";

type SiteStatus = "pass" | "partial" | "externally-blocked" | "fail";

interface SiteResult {
  url: string;
  testedUrl: string;
  status: SiteStatus;
  readiness?: Readiness | undefined;
  ready: number;
  extractedFields: number;
  blocked: number;
  skipped: number;
  frameCount: number;
  formCount: number;
  selectedFormKey?: string | undefined;
  message: string;
  reason: string;
  navigated: boolean;
  submitted: boolean;
}

const REPLACEMENTS: Record<string, string> = {
  "https://designandprint.sg/contact-form/": "https://www.colasit.com.sg/en/contact/",
  "https://www.d1asia.co.th/contact-us": "https://www.bestsuccess.asia/contact",
  "https://www.klbrasil.com.br/contato": "https://rockty.com/contato",
  "https://canone.com.my/contact/": "https://dnb.com.my/contact-us/",
  "https://www.netsolveit.co.za/contact-us/": "https://www.stadlerform.co.za/contact/",
  "https://www.compronet.de/en/contact": "https://www.fmb.de/en/contact/contact-form"
};

async function pool(): Promise<string[]> {
  const markdown = await readFile("qa-results/2026-07-10/site-pool.md", "utf8");
  return [...markdown.matchAll(/\|[^|]+\|\s*(https?:\/\/[^|\s]+)\s*\|/g)].map((match) => match[1]!);
}

function emptyMetrics(): Pick<SiteResult, "ready" | "extractedFields" | "blocked" | "skipped" | "frameCount" | "formCount"> {
  return { ready: 0, extractedFields: 0, blocked: 0, skipped: 0, frameCount: 0, formCount: 0 };
}

async function diagnosticsFromPopup(popup: import("@playwright/test").Page): Promise<Partial<SiteResult>> {
  const main = popup.locator("main");
  const raw = await main.getAttribute("data-diagnostics");
  const diagnostics = raw ? JSON.parse(raw) as Record<string, unknown> : {};
  return {
    readiness: typeof diagnostics.readiness === "string" ? diagnostics.readiness as Readiness : undefined,
    extractedFields: typeof diagnostics.extractedFields === "number" ? diagnostics.extractedFields : 0,
    ready: typeof diagnostics.ready === "number" ? diagnostics.ready : 0,
    blocked: typeof diagnostics.blocked === "number" ? diagnostics.blocked : 0,
    skipped:
      (typeof diagnostics.skippedSensitive === "number" ? diagnostics.skippedSensitive : 0) +
      (typeof diagnostics.skippedPrefilled === "number" ? diagnostics.skippedPrefilled : 0),
    frameCount: typeof diagnostics.frameCount === "number" ? diagnostics.frameCount : 0,
    formCount: typeof diagnostics.formCount === "number" ? diagnostics.formCount : 0,
    ...(typeof diagnostics.selectedFormKey === "string" ? { selectedFormKey: diagnostics.selectedFormKey } : {})
  };
}

function externalReason(url: string, status: number | undefined, finalUrl: string, body: string): string | null {
  if (status !== undefined && (status === 401 || status === 403 || status === 404 || status >= 500)) {
    return `External HTTP ${status}.`;
  }
  if (finalUrl !== url && /__cf_chl|challenge|captcha|just a moment/i.test(`${finalUrl} ${body}`)) {
    return "External anti-bot challenge or CAPTCHA redirected the page.";
  }
  return null;
}

test("sealed public-site matrix: no submit, no unsafe write, full diagnostics", async ({ context, extensionId }) => {
  test.setTimeout(30 * 60 * 1000);
  const results: SiteResult[] = [];
  const page = await context.newPage();
  let popup: import("@playwright/test").Page | undefined;
  let submitted = false;
  await page.addInitScript(() => {
    (window as Window & { __formpilotSubmitCount?: number }).__formpilotSubmitCount = 0;
    document.addEventListener("submit", () => {
      const state = window as Window & { __formpilotSubmitCount?: number };
      state.__formpilotSubmitCount = (state.__formpilotSubmitCount ?? 0) + 1;
    }, true);
  });

  for (const url of await pool()) {
    const testedUrl = REPLACEMENTS[url] ?? url;
    submitted = false;

    try {
      let response;
      try {
        response = await page.goto(testedUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (error) {
        results.push({
          url, testedUrl, status: "externally-blocked", ...emptyMetrics(),
          message: "External navigation failure.",
          reason: `External navigation failure: ${String(error).split("\n")[0]}`,
          navigated: false, submitted
        });
        continue;
      }

      const before = page.url();
      const body = await page.locator("body").innerText().catch(() => "");
      const blocked = externalReason(testedUrl, response?.status(), before, body);
      if (blocked) {
        results.push({
          url, testedUrl, status: "externally-blocked", ...emptyMetrics(),
          message: `External HTTP response ${response?.status() ?? "unknown"}.`,
          reason: blocked, navigated: false, submitted
        });
        continue;
      }

      await page.waitForFunction(
        () => document.documentElement.dataset.formpilotReady === "true",
        { timeout: 10_000 }
      ).catch(() => undefined);

      // Resolve tab ID from extension context, then target it explicitly.
      const worker = context.serviceWorkers()[0];
      if (!worker) throw new Error("extension service worker unavailable");
      const tabId = await worker.evaluate(async (targetUrl) => {
        const tabs = await chrome.tabs.query({});
        const target = tabs.find((tab) => tab.url === targetUrl);
        if (!target?.id) throw new Error("target tab unavailable");
        return target.id;
      }, before);
      popup ??= await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`, { timeout: 5_000 });

      await popup.waitForFunction(
        () => Number(document.querySelector("main")?.getAttribute("data-profile-fields") ?? 0) > 0,
        { timeout: 5_000 }
      );
      const profileFields = Number(await popup.locator("main").getAttribute("data-profile-fields"));
      if (!Number.isFinite(profileFields) || profileFields <= 0) throw new Error("no-profile");

      const fillButton = popup.getByRole("button", { name: "Fill this form" });
      await expect(fillButton).toBeEnabled({ timeout: 5_000 });
      await fillButton.click();
      await popup.waitForFunction(
        () => !["Ready", "Reading page"].includes(document.querySelector("main")?.getAttribute("data-formpilot-status") ?? ""),
        { timeout: 5_000 }
      );
      const diagnostics = await diagnosticsFromPopup(popup);
      const main = popup.locator("main");
      const message = await main.getAttribute("data-formpilot-status") ?? "Unknown response.";
      const requestId = await main.getAttribute("data-request-id");
      const request = await popup.evaluate(async () => {
        const all = await chrome.storage.session.get(null);
        const requestId = document.querySelector("main")?.getAttribute("data-request-id");
        return Object.values(all).find((value) => Boolean(
          value && typeof value === "object" && "plan" in value &&
          (!requestId || (value as { requestId?: string }).requestId === requestId)
        )) as {
          requestId: string;
          plan: { selectedFormKey?: string; entries: Array<{ fieldId: string; formKey?: string; profileKey: string; transform: string; value: string; status: string }> };
        } | undefined;
      });
      const selectedFormKey = request?.plan.selectedFormKey;
      const entries = request?.plan.entries.filter((entry) =>
        entry.status === "ready" && (!selectedFormKey || entry.formKey === selectedFormKey)
      ) ?? [];

      if (request && requestId && entries.length) {
        await popup.evaluate(async ({ requestId, entries }) => {
          await chrome.runtime.sendMessage({
            kind: "EXECUTE_REQUEST", requestId,
            selections: entries.map((entry) => ({ fieldId: entry.fieldId, enabled: true, profileKey: entry.profileKey, transform: entry.transform, value: entry.value }))
          });
        }, { requestId: request.requestId, entries });
      }
      await page.waitForTimeout(2_000);
      const after = page.url();
      const navigated = after !== before;
      submitted = (await page.evaluate(() =>
        (window as Window & { __formpilotSubmitCount?: number }).__formpilotSubmitCount ?? 0
      )) > 0;
      const status: SiteStatus = submitted || navigated
        ? "fail"
        : entries.length
          ? "pass"
          : "partial";
      results.push({
        url, testedUrl, status,
        ...emptyMetrics(),
        ...diagnostics,
        ready: entries.length || diagnostics.ready || 0,
        message,
        reason: submitted ? "Submission request detected." : navigated ? `Unexpected navigation to ${after}.` : entries.length ? "Verified no-submit fill attempt." : "No safe actionable fields; classified Partial.",
        navigated, submitted
      });
    } catch (error) {
      results.push({
        url, testedUrl, status: "fail", ...emptyMetrics(),
        message: "Harness exception.",
        reason: String(error).split("\n")[0] ?? String(error), navigated: false, submitted
      });
    } finally {
      // Reuse one target and one extension page to avoid Chromium target leaks
      // during long public matrices. Each navigation resets document state.
    }
  }

  await popup?.close().catch(() => undefined);
  await page.close();

  await writeFile("qa-results/2026-07-10/browser-results.json", JSON.stringify({ schemaVersion: 2, generatedAt: new Date().toISOString(), replacements: REPLACEMENTS, results }, null, 2));
  expect(results).toHaveLength(100);
  expect(results.filter((result) => result.status === "fail")).toHaveLength(0);
  expect(results.filter((result) => result.submitted || result.navigated)).toHaveLength(0);
});
