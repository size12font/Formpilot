import { writeFileSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createFillPlan } from "@/background/mappingEngine";
import { fillEntries } from "@/content/actuator";
import { elementByFieldId, extractFields } from "@/content/extractor";
import { verifyEntries } from "@/content/verifier";
import { QA_PROFILE } from "@/shared/qaProfile";
import type { FillPlanEntry } from "@/shared/types";

interface SiteCandidate {
  index: number;
  country: string;
  url: string;
  expectedCoverage: string;
  notes: string;
}

interface FetchResult extends SiteCandidate {
  ok: boolean;
  status?: number;
  finalUrl?: string;
  html?: string;
  error?: string;
  elapsedMs: number;
}

type ExpectedCategory =
  | "given-name"
  | "family-name"
  | "full-name"
  | "email"
  | "phone"
  | "company"
  | "job-title"
  | "website"
  | "street"
  | "address-line2"
  | "city"
  | "region"
  | "postal-code"
  | "country"
  | "exclude";

interface FieldEvidence {
  id: string;
  tag: string;
  type?: string;
  name?: string;
  label?: string | null;
  placeholder?: string;
  autocomplete?: string;
  currentValue?: string;
  expectedCategory: ExpectedCategory | null;
  expectedEligible: boolean;
  unsafeReason?: string;
  planStatus: FillPlanEntry["status"];
  profileKey: string;
  transform: string;
  confidence: number;
  mappingCategory: ExpectedCategory | null;
  mappingCorrect: boolean;
  verification?: string;
  actual?: string;
  validAfterFill?: boolean;
}

interface SiteResult extends SiteCandidate {
  finalUrl?: string;
  httpStatus?: number;
  fetchMs: number;
  bytes: number;
  language: string;
  title: string;
  technologies: string[];
  forms: number;
  submitControls: number;
  extracted: number;
  nativeFields: number;
  customFields: number;
  ready: number;
  lowConfidence: number;
  unresolvedOption: number;
  skippedSensitive: number;
  skippedPrefilled: number;
  verifiedOk: number;
  verifyMismatch: number;
  verifyCleared: number;
  verifyFailed: number;
  eligibleFields: number;
  correctReady: number;
  missedEligible: number;
  wrongReady: number;
  unexpectedReady: number;
  unsafeReady: number;
  invalidReady: number;
  visionUsed: boolean;
  status: "Pass" | "Partial" | "Fail" | "Blocked";
  issueFamilies: string[];
  findings: string[];
  fields: FieldEvidence[];
  error?: string;
}

const POOL_PATH = resolve("qa-results/2026-07-10/site-pool.md");
const RESULTS_PATH = resolve("qa-results/2026-07-10/live-dom-results.json");
const MAX_HTML_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 8;
const execFileAsync = promisify(execFile);

function parsePool(): SiteCandidate[] {
  return readFileSync(POOL_PATH, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Country"))
    .map((line, index) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      return {
        index: index + 1,
        country: cells[0] ?? "Unknown",
        url: cells[1] ?? "",
        expectedCoverage: cells[2] ?? "",
        notes: cells[3] ?? ""
      };
    })
    .filter((site) => /^https?:\/\//.test(site.url));
}

function technologySignals(html: string): string[] {
  const lower = html.toLowerCase();
  const signals: Array<[string, RegExp]> = [
    ["WordPress", /wp-content|wp-includes/],
    ["Elementor", /elementor/],
    ["Divi", /et_pb_|themes\/divi|divi[-_ ](?:theme|builder)/],
    ["Gravity Forms", /gform_wrapper|gravityforms/],
    ["Contact Form 7", /wpcf7/],
    ["Webflow", /webflow/],
    ["Wix", /wixstatic|wix-code/],
    ["HubSpot", /hsforms|hubspot/],
    ["React", /data-reactroot|__next_data__|react-dom/],
    ["Next.js", /__next_data__|\/_next\//],
    ["Vue", /data-v-[a-f0-9]|__nuxt__|\/_nuxt\//],
    ["Angular", /ng-version|ng-app/],
    ["Drupal", /drupalsettings|sites\/default\/files/],
    ["Joomla", /option=com_|\/media\/system\/js/],
    ["Shopify", /cdn\.shopify\.com|shopify-section/],
    ["OpenCart", /route=information|catalog\/view\/theme/],
    ["reCAPTCHA", /recaptcha/],
    ["hCaptcha", /hcaptcha/],
    ["iframe form", /<iframe[^>]+(?:form|hubspot|typeform|jotform|crm|contact)/]
  ];
  const found = signals.filter(([, pattern]) => pattern.test(lower)).map(([name]) => name);
  return found.length > 0 ? [...new Set(found)] : ["Unclassified HTML/CMS"];
}

async function fetchSite(site: SiteCandidate): Promise<FetchResult> {
  const started = Date.now();
  try {
    const marker = "\n__FORMPILOT_META__";
    const { stdout } = await execFileAsync(
      "curl",
      [
        "--location",
        "--silent",
        "--show-error",
        "--compressed",
        "--max-time",
        String(FETCH_TIMEOUT_MS / 1000),
        "--connect-timeout",
        "8",
        "--user-agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 FormPilot-QA/1.0",
        "--header",
        "Accept: text/html,application/xhtml+xml",
        "--write-out",
        `${marker}%{http_code}\t%{url_effective}\t%{content_type}`,
        site.url
      ],
      { encoding: "utf8", maxBuffer: MAX_HTML_BYTES + 1_000_000, timeout: FETCH_TIMEOUT_MS + 5_000 }
    );
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) throw new Error("missing response metadata");
    const html = stdout.slice(0, markerIndex).slice(0, MAX_HTML_BYTES);
    const [statusText = "0", finalUrl = site.url, contentType = ""] = stdout
      .slice(markerIndex + marker.length)
      .split("\t");
    const status = Number(statusText);
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return {
        ...site,
        ok: false,
        status,
        finalUrl,
        error: `non-HTML response: ${contentType || "unknown"}`,
        elapsedMs: Date.now() - started
      };
    }
    return {
      ...site,
      ok: status >= 200 && status < 400,
      status,
      finalUrl,
      html,
      ...(status >= 200 && status < 400 ? {} : { error: `HTTP ${status}` }),
      elapsedMs: Date.now() - started
    };
  } catch (error) {
    return {
      ...site,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started
    };
  }
}

async function fetchAll(sites: SiteCandidate[]): Promise<FetchResult[]> {
  const results = new Array<FetchResult>(sites.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < sites.length) {
      const index = cursor++;
      const site = sites[index];
      if (site) results[index] = await fetchSite(site);
    }
  }
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, () => worker()));
  return results;
}

function countStatuses(entries: FillPlanEntry[]) {
  return {
    ready: entries.filter((entry) => entry.status === "ready").length,
    lowConfidence: entries.filter((entry) => entry.status === "low-confidence").length,
    unresolvedOption: entries.filter((entry) => entry.status === "unresolved-option").length,
    skippedSensitive: entries.filter((entry) => entry.status === "skipped-sensitive").length,
    skippedPrefilled: entries.filter((entry) => entry.status === "skipped-prefilled").length
  };
}

function descriptorText(field: ReturnType<typeof extractFields>[number]): string {
  return [
    field.autocomplete,
    field.name,
    field.domId,
    field.placeholder,
    field.label,
    field.nearbyText,
    field.sectionHeading,
    field.type
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function unsafeReason(field: ReturnType<typeof extractFields>[number]): string | undefined {
  const text = descriptorText(field);
  if (field.type === "file") return "file-upload";
  if (/honeypot|honey-pot|leave (?:this )?field blank|do not fill|don'?t fill|no need to fill|spam trap|anti[- ]spam field/.test(text)) {
    return "honeypot-or-bot-trap";
  }
  if (
    (field.type === "checkbox" || field.type === "radio" || field.tag !== "input") &&
    /consent|privacy|terms|marketing|newsletter|subscribe|agree|accept|datenschutz|privacidad|pol[ií]tica|acepto|z[gł]adzam|souhlas/.test(text)
  ) {
    return "consent-or-marketing-choice";
  }
  return undefined;
}

function categoryFromText(text: string): Exclude<ExpectedCategory, "exclude"> | null {
  if (/company|organisation|organization|business name|empresa|compa[nñ][ií]a|soci[eé]t[eé]|entreprise|firma|sp[oó][lł]ka|spole[cč]nost|f[oö]retag|perusahaan|c[oô]ng ty|会社|บริษัท/.test(text)) return "company";
  if (/job title|position|cargo|puesto|fonction|functie|stanowisko|pozice|jabatan|chức vụ/.test(text)) return "job-title";
  if (/full name|your name|contact person|nombre y apellido|nombre completo|nome completo|nom complet|first and last name|first and surname|name and surname|họ và tên|氏名/.test(text)) return "full-name";
  if (/first name|given name|pr[eé]nom|nombre de pila|nome pr[oó]prio|imi[eę]|křestn[ií]|first|名(?:前)?|ชื่อ/.test(text)) return "given-name";
  if (/last name|family name|surname|apellido|sobrenome|nom de famille|nazwisko|příjmení|นามสกุล|姓/.test(text)) return "family-name";
  if (/name|naam|namn|nama/.test(text)) return "full-name";
  if (/e-?mail|correo|courriel|posta elettronica|e-post|อีเมล|メール/.test(text)) return "email";
  if (/phone|telephone|mobile|tel[eé]fono|telefone|t[eé]l[eé]phone|telefon|โทรศัพท์|電話|điện thoại|whatsapp/.test(text)) return "phone";
  if (/website|web site|site web|sitio web|strona www|company url/.test(text)) return "website";
  if (/address line 2|apartment|suite|unit|apt\b/.test(text)) return "address-line2";
  if (/street|address line 1|adresse|direcci[oó]n|endere[cç]o|ulica|住所|ที่อยู่|địa chỉ/.test(text)) return "street";
  if (/postal|postcode|zip|code postal|c[oó]digo postal|kod pocztowy|ps[cč]|郵便|รหัสไปรษณีย์/.test(text)) return "postal-code";
  if (/city|town|ville|ciudad|cidade|miasto|m[eě]sto|kota|thành phố|市|เมือง/.test(text)) return "city";
  if (/state|province|region|regi[oó]n|wojew[oó]dztwo|provinsi/.test(text)) return "region";
  if (/country|pays|pa[ií]s|kraj|zem[eě]|negara|quốc gia|国|ประเทศ/.test(text)) return "country";
  return null;
}

function expectedCategory(field: ReturnType<typeof extractFields>[number]): ExpectedCategory | null {
  if (unsafeReason(field)) return "exclude";
  if (field.type === "checkbox" || field.type === "radio") return null;
  const autocomplete = field.autocomplete?.toLowerCase() ?? "";

  if (autocomplete.includes("given-name")) return "given-name";
  if (autocomplete.includes("family-name")) return "family-name";
  if (autocomplete === "name") return "full-name";
  if (autocomplete.includes("email") || field.type === "email") return "email";
  if (autocomplete.includes("tel") || field.type === "tel") return "phone";
  if (autocomplete.includes("organization-title")) return "job-title";
  if (autocomplete.includes("organization")) return "company";
  if (autocomplete.includes("street-address") || autocomplete.includes("address-line1")) return "street";
  if (autocomplete.includes("address-line2")) return "address-line2";
  if (autocomplete.includes("address-level2")) return "city";
  if (autocomplete.includes("address-level1")) return "region";
  if (autocomplete.includes("postal-code")) return "postal-code";
  if (autocomplete.includes("country")) return "country";
  if (autocomplete.includes("url") || field.type === "url") return "website";

  const structural = [field.name, field.domId, field.placeholder, field.type]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const label = String(field.label ?? "").toLocaleLowerCase();
  const context = [field.nearbyText, field.sectionHeading]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const structuralCategory = categoryFromText(structural);
  const genericStructuralName =
    structuralCategory === "full-name" &&
    !/full|first|last|given|family|surname|apellido|sobrenome|pr[eé]nom|nazwisko|příjmení/.test(structural);
  if (structuralCategory && !genericStructuralName) return structuralCategory;
  const labelCategory = categoryFromText(label);
  if (labelCategory) return labelCategory;
  if (structuralCategory) return structuralCategory;
  const contextCategory = categoryFromText(context);
  if (contextCategory) return contextCategory;
  return null;
}

function mappedCategory(entry: FillPlanEntry): ExpectedCategory | null {
  if (entry.transform === "name:full") return "full-name";
  if (entry.profileKey === "identity.givenName") return "given-name";
  if (entry.profileKey === "identity.familyName") return "family-name";
  if (/^contact\.emails\[\d+\]\.value$/.test(entry.profileKey)) return "email";
  if (/^contact\.phones\[\d+\]\./.test(entry.profileKey)) return "phone";
  if (entry.profileKey === "work.company") return "company";
  if (entry.profileKey === "work.jobTitle") return "job-title";
  if (entry.profileKey === "work.website") return "website";
  if (/^addresses\[\d+\]\.street$/.test(entry.profileKey)) return "street";
  if (/^addresses\[\d+\]\.line2$/.test(entry.profileKey)) return "address-line2";
  if (/^addresses\[\d+\]\.city$/.test(entry.profileKey)) return "city";
  if (/^addresses\[\d+\]\.region$/.test(entry.profileKey)) return "region";
  if (/^addresses\[\d+\]\.postalCode$/.test(entry.profileKey)) return "postal-code";
  if (/^addresses\[\d+\]\.country$/.test(entry.profileKey)) return "country";
  return null;
}

function blockedResult(fetchResult: FetchResult, error: string): SiteResult {
  return {
    index: fetchResult.index,
    country: fetchResult.country,
    url: fetchResult.url,
    expectedCoverage: fetchResult.expectedCoverage,
    notes: fetchResult.notes,
    ...(fetchResult.finalUrl ? { finalUrl: fetchResult.finalUrl } : {}),
    ...(fetchResult.status ? { httpStatus: fetchResult.status } : {}),
    fetchMs: fetchResult.elapsedMs,
    bytes: fetchResult.html?.length ?? 0,
    language: "",
    title: "",
    technologies: [],
    forms: 0,
    submitControls: 0,
    extracted: 0,
    nativeFields: 0,
    customFields: 0,
    ready: 0,
    lowConfidence: 0,
    unresolvedOption: 0,
    skippedSensitive: 0,
    skippedPrefilled: 0,
    verifiedOk: 0,
    verifyMismatch: 0,
    verifyCleared: 0,
    verifyFailed: 0,
    eligibleFields: 0,
    correctReady: 0,
    missedEligible: 0,
    wrongReady: 0,
    unexpectedReady: 0,
    unsafeReady: 0,
    invalidReady: 0,
    visionUsed: false,
    status: "Blocked",
    issueFamilies: ["reachability-or-rendering"],
    findings: [error],
    fields: [],
    error
  };
}

async function evaluateSite(fetchResult: FetchResult): Promise<SiteResult> {
  if (!fetchResult.ok || !fetchResult.html) {
    return blockedResult(fetchResult, fetchResult.error ?? "fetch failed");
  }

  try {
    const sanitizedHtml = fetchResult.html.replace(
      /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
      ""
    );
    document.open();
    document.write(sanitizedHtml);
    document.close();
    document.querySelectorAll("*").forEach((element) => {
      for (const attribute of Array.from(element.attributes)) {
        if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      }
    });

    const fields = extractFields();
    const nativeIds = new Set(
      fields
        .filter((field) => {
          const element = elementByFieldId.get(field.id);
          return element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement;
        })
        .map((field) => field.id)
    );
    const customFields = fields.length - nativeIds.size;
    const language = document.documentElement.lang || "unknown";
    const title = document.title.trim();
    const technologies = technologySignals(fetchResult.html);
    const forms = document.querySelectorAll("form").length;
    const submitControls = document.querySelectorAll(
      "button[type='submit'],input[type='submit'],button:not([type])"
    ).length;

    if (fields.length === 0) {
      const dynamic = technologies.some((item) =>
        ["React", "Next.js", "Vue", "Angular", "HubSpot", "iframe form"].includes(item)
      );
      return {
        ...blockedResult(
          fetchResult,
          dynamic
            ? "no static fields; full browser rendering required"
            : "no visible fillable fields in fetched HTML"
        ),
        language,
        title,
        technologies,
        forms,
        submitControls,
        bytes: fetchResult.html.length,
        issueFamilies: [dynamic ? "dynamic-or-iframe-form" : "no-public-form"]
      };
    }

    const plan = await createFillPlan({
      fields,
      profile: QA_PROFILE,
      url: fetchResult.finalUrl ?? fetchResult.url,
      pageLang: language,
      pageTitle: title
    });
    const counts = countStatuses(plan.entries);
    const nativeReady = plan.entries.filter(
      (entry) => entry.status === "ready" && nativeIds.has(entry.fieldId)
    );
    await fillEntries(nativeReady, { simulateTyping: false });
    const verification = verifyEntries(nativeReady);
    const verifiedOk = verification.filter((item) => item.status === "ok").length;
    const verifyMismatch = verification.filter((item) => item.status === "mismatch").length;
    const verifyCleared = verification.filter((item) => item.status === "cleared").length;
    const verifyFailed = verification.filter((item) => item.status === "failed").length;
    const verificationFailures = verifyMismatch + verifyCleared + verifyFailed;
    const verificationById = new Map(verification.map((item) => [item.fieldId, item]));
    const entryById = new Map(plan.entries.map((entry) => [entry.fieldId, entry]));
    const fieldEvidence: FieldEvidence[] = fields.flatMap((field) => {
      const entry = entryById.get(field.id);
      if (!entry) return [];
      const expected = expectedCategory(field);
      const unsafe = unsafeReason(field);
      const expectedEligible = expected !== null && expected !== "exclude";
      const mapped = mappedCategory(entry);
      const mappingCorrect =
        expectedEligible && entry.status === "ready" && mapped === expected;
      const verify = verificationById.get(field.id);
      const element = elementByFieldId.get(field.id);
      const canValidate =
        entry.status === "ready" &&
        (element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement);
      const validAfterFill = canValidate ? element.checkValidity() : undefined;
      return [{
        id: field.id,
        tag: field.tag,
        ...(field.type ? { type: field.type } : {}),
        ...(field.name ? { name: field.name } : {}),
        ...(field.label !== undefined ? { label: field.label } : {}),
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        ...(field.autocomplete ? { autocomplete: field.autocomplete } : {}),
        ...(field.currentValue ? { currentValue: field.currentValue } : {}),
        expectedCategory: expected,
        expectedEligible,
        ...(unsafe ? { unsafeReason: unsafe } : {}),
        planStatus: entry.status,
        profileKey: entry.profileKey,
        transform: entry.transform,
        confidence: entry.confidence,
        mappingCategory: mapped,
        mappingCorrect,
        ...(verify ? { verification: verify.status, actual: verify.actual } : {}),
        ...(validAfterFill !== undefined ? { validAfterFill } : {})
      }];
    });
    const eligibleFields = fieldEvidence.filter((field) => field.expectedEligible).length;
    const correctReady = fieldEvidence.filter((field) => field.mappingCorrect).length;
    const missedEligible = fieldEvidence.filter(
      (field) => field.expectedEligible && field.planStatus !== "ready"
    ).length;
    const wrongReady = fieldEvidence.filter(
      (field) => field.expectedEligible && field.planStatus === "ready" && !field.mappingCorrect
    ).length;
    const unexpectedReady = fieldEvidence.filter(
      (field) =>
        field.expectedCategory === null &&
        field.planStatus === "ready" &&
        field.profileKey !== "SKIP"
    ).length;
    const unsafeReady = fieldEvidence.filter(
      (field) => field.expectedCategory === "exclude" && field.planStatus === "ready"
    ).length;
    const invalidReady = fieldEvidence.filter(
      (field) => field.planStatus === "ready" && field.validAfterFill === false
    ).length;

    const issueFamilies: string[] = [];
    const findings: string[] = [];
    if (missedEligible > 0) {
      issueFamilies.push("eligible-field-mapping-miss");
      findings.push(`${missedEligible}/${eligibleFields} eligible field(s) missed`);
    }
    if (wrongReady + unexpectedReady > 0) {
      issueFamilies.push("incorrect-or-unexpected-mapping");
      findings.push(`${wrongReady} wrong eligible mapping(s); ${unexpectedReady} unexpected ready mapping(s)`);
    }
    if (unsafeReady > 0) {
      issueFamilies.push("unsafe-control-policy");
      findings.push(`${unsafeReady} honeypot/file/consent control(s) marked ready`);
    }
    if (counts.unresolvedOption > 0) {
      issueFamilies.push("select-option-resolution");
      findings.push(`${counts.unresolvedOption} unresolved select option(s)`);
    }
    if (verificationFailures > 0) {
      issueFamilies.push("actuation-or-retention");
      findings.push(`${verificationFailures} native value verification failure(s)`);
    }
    if (invalidReady > 0) {
      issueFamilies.push("html-constraint-validation");
      findings.push(`${invalidReady} filled value(s) violate HTML constraints`);
    }
    if (customFields > 0) {
      issueFamilies.push("custom-controls-browser-only");
      findings.push(`${customFields} custom ARIA/contenteditable field(s) need full-browser actuation`);
    }
    if (fields.length >= 40) {
      issueFamilies.push("multiple-or-overscoped-forms");
      findings.push(`${fields.length} fields extracted across page; likely multiple/overscoped forms`);
    }
    if (counts.skippedSensitive > 0) {
      findings.push(`${counts.skippedSensitive} sensitive field(s) safely skipped`);
    }
    if (counts.skippedPrefilled > 0) {
      findings.push(`${counts.skippedPrefilled} prefilled field(s) preserved`);
    }
    findings.push(`${correctReady}/${eligibleFields} independently expected field(s) correctly mapped ready`);

    let status: SiteResult["status"] = "Pass";
    if (
      correctReady === 0 ||
      verificationFailures > 0 ||
      wrongReady > 0 ||
      unexpectedReady > 0 ||
      unsafeReady > 0 ||
      invalidReady > 0
    ) status = "Fail";
    else if (
      missedEligible > 0 ||
      counts.unresolvedOption > 0 ||
      customFields > 0
    ) status = "Partial";

    return {
      index: fetchResult.index,
      country: fetchResult.country,
      url: fetchResult.url,
      expectedCoverage: fetchResult.expectedCoverage,
      notes: fetchResult.notes,
      ...(fetchResult.finalUrl ? { finalUrl: fetchResult.finalUrl } : {}),
      ...(fetchResult.status ? { httpStatus: fetchResult.status } : {}),
      fetchMs: fetchResult.elapsedMs,
      bytes: fetchResult.html.length,
      language,
      title,
      technologies,
      forms,
      submitControls,
      extracted: fields.length,
      nativeFields: nativeIds.size,
      customFields,
      ...counts,
      verifiedOk,
      verifyMismatch,
      verifyCleared,
      verifyFailed,
      eligibleFields,
      correctReady,
      missedEligible,
      wrongReady,
      unexpectedReady,
      unsafeReady,
      invalidReady,
      visionUsed: plan.visionUsed,
      status,
      issueFamilies: [...new Set(issueFamilies)],
      findings,
      fields: fieldEvidence
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...blockedResult(fetchResult, `harness error: ${message}`),
      status: "Fail",
      issueFamilies: ["harness-or-parser-error"]
    };
  }
}

describe("100-site live DOM QA", () => {
  beforeAll(() => {
    if (!globalThis.CSS) {
      Object.defineProperty(globalThis, "CSS", { value: {}, configurable: true });
    }
    Object.defineProperty(globalThis.CSS, "escape", {
      configurable: true,
      value: (value: string) =>
        String(value)
          .replace(/\0/g, "�")
          .replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, (character, leadingDigit) =>
            leadingDigit ? `\\3${character} ` : `\\${character}`
          )
    });
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue(
      [{} as DOMRect] as unknown as DOMRectList
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 32,
      top: 0,
      right: 200,
      bottom: 32,
      left: 0,
      toJSON: () => ({})
    });
  });

  it("fetches, maps, fills, and verifies public form snapshots without submitting", async () => {
    const sites = parsePool();
    expect(sites).toHaveLength(100);

    const fetched = await fetchAll(sites);
    const results: SiteResult[] = [];
    for (const fetchResult of fetched) results.push(await evaluateSite(fetchResult));

    const summary = {
      generatedAt: new Date().toISOString(),
      methodology: "Fetched production HTML; executed FormPilot extractor, heuristic mapper, native actuator, and verifier in jsdom. No scripts, custom widgets, or cross-origin iframes executed. No forms submitted.",
      total: results.length,
      countries: new Set(results.map((result) => result.country)).size,
      status: Object.fromEntries(
        ["Pass", "Partial", "Fail", "Blocked"].map((status) => [
          status,
          results.filter((result) => result.status === status).length
        ])
      ),
      reachable: results.filter((result) => result.httpStatus && result.httpStatus < 400).length,
      withExtractedFields: results.filter((result) => result.extracted > 0).length,
      totalExtractedFields: results.reduce((sum, result) => sum + result.extracted, 0),
      totalReady: results.reduce((sum, result) => sum + result.ready, 0),
      totalLowConfidence: results.reduce((sum, result) => sum + result.lowConfidence, 0),
      totalUnresolvedOptions: results.reduce((sum, result) => sum + result.unresolvedOption, 0),
      eligibleFields: results.reduce((sum, result) => sum + result.eligibleFields, 0),
      correctReady: results.reduce((sum, result) => sum + result.correctReady, 0),
      missedEligible: results.reduce((sum, result) => sum + result.missedEligible, 0),
      wrongReady: results.reduce((sum, result) => sum + result.wrongReady, 0),
      unexpectedReady: results.reduce((sum, result) => sum + result.unexpectedReady, 0),
      unsafeReady: results.reduce((sum, result) => sum + result.unsafeReady, 0),
      invalidReady: results.reduce((sum, result) => sum + result.invalidReady, 0),
      totalVerificationFailures: results.reduce(
        (sum, result) =>
          sum + result.verifyMismatch + result.verifyCleared + result.verifyFailed,
        0
      ),
      issueFamilies: Object.fromEntries(
        [...new Set(results.flatMap((result) => result.issueFamilies))]
          .sort()
          .map((family) => [
            family,
            results.filter((result) => result.issueFamilies.includes(family)).length
          ])
      )
    };

    writeFileSync(RESULTS_PATH, `${JSON.stringify({ summary, results }, null, 2)}\n`);
    expect(results).toHaveLength(100);
  });
});
