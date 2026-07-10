import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const inputPath = resolve("qa-results/2026-07-10/live-dom-results.json");
const outputPath = resolve("qa-results/2026-07-10/in-the-wild-report.md");
const { summary, results } = JSON.parse(readFileSync(inputPath, "utf8"));

const pct = (value, total) => (total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%");
const cell = (value) => String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
const shortError = (result) => {
  const text = result.error ?? result.findings?.join("; ") ?? "";
  if (/Could not resolve host/.test(text)) return "DNS failure";
  if (/Connection reset/.test(text)) return "connection reset";
  if (/HTTP \d+/.test(text)) return text.match(/HTTP \d+/)?.[0] ?? text;
  return cell(text).slice(0, 160);
};
const domain = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
};

const allFields = results.flatMap((result) =>
  result.fields.map((field) => ({ ...field, siteIndex: result.index, siteUrl: result.url }))
);
const categoryStats = (predicate) => {
  const fields = allFields.filter(predicate);
  return {
    expected: fields.length,
    correct: fields.filter((field) => field.mappingCorrect).length,
    wrong: fields.filter(
      (field) => field.planStatus === "ready" && !field.mappingCorrect
    ).length,
    missed: fields.filter((field) => field.planStatus !== "ready").length
  };
};
const company = categoryStats((field) => field.expectedCategory === "company");
const names = categoryStats((field) =>
  ["given-name", "family-name", "full-name"].includes(field.expectedCategory)
);
const email = categoryStats((field) => field.expectedCategory === "email");
const phone = categoryStats((field) => field.expectedCategory === "phone");
const country = categoryStats((field) => field.expectedCategory === "country");
const unsafeFields = allFields.filter(
  (field) => field.expectedCategory === "exclude" && field.planStatus === "ready"
);
const wrongCompanySamples = allFields
  .filter(
    (field) =>
      field.expectedCategory === "company" &&
      field.planStatus === "ready" &&
      !field.mappingCorrect
  )
  .slice(0, 20);
const blocked = results.filter((result) => result.status === "Blocked");
const passing = results.filter((result) => result.status === "Pass");
const verificationFailures = allFields.filter((field) =>
  ["mismatch", "cleared", "failed"].includes(field.verification)
);
const verificationByControl = Object.entries(
  verificationFailures.reduce((counts, field) => {
    const key = `${field.tag}:${field.type ?? ""}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {})
).sort((a, b) => b[1] - a[1]);
const customFields = results.reduce((sum, result) => sum + result.customFields, 0);
const customSites = results.filter((result) => result.customFields > 0).length;
const prefilledPreserved = results.reduce((sum, result) => sum + result.skippedPrefilled, 0);
const sensitiveSkipped = results.reduce((sum, result) => sum + result.skippedSensitive, 0);

const matrixRows = results.map((result) => {
  const stack = result.technologies.length
    ? result.technologies.join(", ")
    : "unavailable";
  const preview = result.status === "Blocked"
    ? "—"
    : `${result.correctReady}/${result.eligibleFields} correct; ${result.missedEligible} miss; ${result.wrongReady} wrong; ${result.unexpectedReady} unexpected; ${result.unsafeReady} unsafe`;
  const fill = result.status === "Blocked"
    ? "—"
    : `${result.verifiedOk} verified; ${result.verifyMismatch + result.verifyCleared + result.verifyFailed} failed; ${result.invalidReady} invalid`;
  const finding = result.status === "Blocked"
    ? shortError(result)
    : result.findings.join("; ");
  return `| ${result.index} | [${cell(domain(result.url))}](${result.url}) | ${cell(result.country)} | ${cell(stack)}; ${result.forms} form(s), ${result.extracted} field(s) | ${cell(preview)} | ${cell(fill)} | **${result.status}** | ${cell(finding)} |`;
}).join("\n");

const safetyRows = unsafeFields.map((field) =>
  `| ${field.siteIndex} | [${cell(domain(field.siteUrl))}](${field.siteUrl}) | ${cell(field.tag)}:${cell(field.type)} | ${cell(field.label || field.placeholder || field.name)} | ${cell(field.unsafeReason)} | ${cell(field.profileKey)} | ${field.confidence.toFixed(2)} |`
).join("\n");

const wrongCompanyRows = wrongCompanySamples.map((field) =>
  `| ${field.siteIndex} | [${cell(domain(field.siteUrl))}](${field.siteUrl}) | ${cell(field.label || field.placeholder || field.name)} | company | ${cell(field.profileKey)} | ${cell(field.transform)} | ${field.confidence.toFixed(2)} |`
).join("\n");

const blockedRows = blocked.map((result) =>
  `| ${result.index} | [${cell(domain(result.url))}](${result.url}) | ${cell(result.country)} | ${cell(shortError(result))} |`
).join("\n");

const report = `# FormPilot — 100-Site In-the-Wild QA Report

**Run date:** 2026-07-10  
**Scope completed:** 100 public production URLs across 36 countries  
**Product fixes during run:** **0**  
**External actions:** **0 submissions, sends, bookings, registrations, uploads, purchases, CAPTCHA solutions, or account actions**

## Executive verdict

Current deterministic/native autofill engine is promising for standard email and phone fields, but not ready for broad unattended use. Static live-DOM results: **${summary.status.Pass} pass, ${summary.status.Partial} partial, ${summary.status.Fail} fail, ${summary.status.Blocked} blocked**.

Biggest risk is not reachability. It is semantic/control correctness:

- **${summary.wrongReady} wrong eligible mappings** plus **${summary.unexpectedReady} unexpected ready mappings** across ${summary.issueFamilies["incorrect-or-unexpected-mapping"]} sites.
- **${summary.unsafeReady} safety-sensitive controls marked ready** across ${summary.issueFamilies["unsafe-control-policy"]} sites: one honeypot, four KONE marketing checkboxes, one privacy-consent radio.
- **${summary.totalVerificationFailures} native verification failures** across ${summary.issueFamilies["actuation-or-retention"]} sites; failures concentrate in radios/checkboxes.
- **${summary.missedEligible} eligible fields missed** across ${summary.issueFamilies["eligible-field-mapping-miss"]} sites.
- Company mapping is weakest common field: **${company.correct}/${company.expected} correct (${pct(company.correct, company.expected)})**. Twenty-nine company fields mapped to personal identity data; ${company.missed} were missed.
- Email is strongest: **${email.correct}/${email.expected} correct (${pct(email.correct, email.expected)})**. Phone: **${phone.correct}/${phone.expected} (${pct(phone.correct, phone.expected)})**.

## What was tested

Two read-only layers were run:

1. **Reachability/stack scan:** GET-only checks on all 100 URLs. Result: 96 HTTP 200, 90 pages with static forms, three browser-dependent candidates, two anti-bot 403s, one DNS failure, one stale 404, and several pages with no usable current form. Stack coverage includes WordPress, Next.js, HubSpot, Webflow, Drupal, React, Wix, Vue, OpenCart, SilverStripe, Weebly, Bootstrap, and jQuery.
2. **FormPilot engine pass:** fetched production HTML, then executed FormPilot's actual extractor, deterministic fallback mapper, native actuator, and verifier against the hardcoded synthetic profile. ${summary.withExtractedFields} pages produced fields; **${summary.totalExtractedFields.toLocaleString()} controls** were extracted. No page submit controls were activated.

### Scope boundary

Chrome blocks agent control of internal extension-management pages, so updated unpacked extension could not be reloaded. This report therefore proves **live production DOM compatibility at engine level**, not full extension E2E.

Not exercised here:

- popup, shortcut, context-menu, MV3 background lifecycle, message routing, preview overlay, corrections, cache, screenshot/LanguageModel mapping, dynamic page JavaScript, delayed controlled rerenders, custom widget popups, cross-origin iframes, or multi-step conditional reveals;
- visual before/after screenshots and true two-second retention in a live browser;
- real Chrome isolated-world differences.

Those remain explicit gates in the fix plan. Results below must not be represented as full Chrome-extension certification.

## Aggregate results

| Metric | Result |
|:--|--:|
| URLs / countries | ${summary.total} / ${summary.countries} |
| Static engine pass / partial / fail / blocked | ${summary.status.Pass} / ${summary.status.Partial} / ${summary.status.Fail} / ${summary.status.Blocked} |
| Extracted controls | ${summary.totalExtractedFields.toLocaleString()} |
| Independently expected profile-eligible fields | ${summary.eligibleFields} |
| Correct ready mappings | ${summary.correctReady} (${pct(summary.correctReady, summary.eligibleFields)}) |
| Missed eligible fields | ${summary.missedEligible} (${pct(summary.missedEligible, summary.eligibleFields)}) |
| Wrong eligible mappings | ${summary.wrongReady} (${pct(summary.wrongReady, summary.eligibleFields)}) |
| Unexpected ready mappings | ${summary.unexpectedReady} |
| Unsafe controls marked ready | ${summary.unsafeReady} |
| Unresolved select options | ${summary.totalUnresolvedOptions} |
| Native verification failures | ${summary.totalVerificationFailures} |
| Invalid filled values | ${summary.invalidReady} |
| Custom controls needing browser execution | ${customFields} fields on ${customSites} sites |
| Prefilled fields preserved | ${prefilledPreserved} |
| Sensitive fields skipped | ${sensitiveSkipped} |

### Field-family accuracy

| Family | Expected | Correct ready | Wrong ready | Missed | Correct rate |
|:--|--:|--:|--:|--:|--:|
| Email | ${email.expected} | ${email.correct} | ${email.wrong} | ${email.missed} | ${pct(email.correct, email.expected)} |
| Phone | ${phone.expected} | ${phone.correct} | ${phone.wrong} | ${phone.missed} | ${pct(phone.correct, phone.expected)} |
| Person name | ${names.expected} | ${names.correct} | ${names.wrong} | ${names.missed} | ${pct(names.correct, names.expected)} |
| Company | ${company.expected} | ${company.correct} | ${company.wrong} | ${company.missed} | ${pct(company.correct, company.expected)} |
| Country | ${country.expected} | ${country.correct} | ${country.wrong} | ${country.missed} | ${pct(country.correct, country.expected)} |

## Common issue families

### 1. Specific semantics lose to generic “name” matching — P1

Observed on ${summary.issueFamilies["incorrect-or-unexpected-mapping"]} sites. Company name frequently maps to personal full name because generic name matching wins before company semantics. Split first/last-name fields also sometimes receive full name.

Evidence: only ${company.correct}/${company.expected} company fields correct; 29 mapped to identity fields. Representative examples:

| # | Site | Field | Expected | Planned profile key | Transform | Confidence |
|--:|:--|:--|:--|:--|:--|--:|
${wrongCompanyRows}

### 2. Checkboxes/radios use text-field semantics — P0/P1

${summary.totalVerificationFailures} verification failures: ${verificationByControl.map(([control, count]) => `${count} ${control}`).join(", ")}. Native radio and checkbox actuation reduces arbitrary profile values to a boolean regex, so titles, subjects, preferences, and radio choices clear or fail instead of selecting the intended option.

### 3. Safety exclusions are incomplete — P0

Cold-path sensitive and prefilled guards did work: ${sensitiveSkipped} sensitive fields skipped and ${prefilledPreserved} prefilled fields preserved. However ${summary.unsafeReady} controls still reached ready status:

| # | Site | Control | Label | Risk | Planned profile key | Confidence |
|--:|:--|:--|:--|:--|:--|--:|
${safetyRows}

No forms were submitted. “Ready” here means plan-policy failure, not proof that an external action occurred.

### 4. Eligible-field recall remains uneven — P1

${summary.missedEligible}/${summary.eligibleFields} independently expected fields were missed on ${summary.issueFamilies["eligible-field-mapping-miss"]} sites. Email/phone are strong; localized names, company, address, and country fields account for most misses.

### 5. Country/select handling is narrow — P1

Country fields: ${country.correct}/${country.expected} correct. Four selects were unresolved. Code inspection also found option lists capped at 50 during extraction and 20 in prompt context, plus localized country names limited to a small language set.

### 6. Form scope is page-wide — P1

Legrand France, Trada, and Temas exposed 45–75 controls across multiple forms. One page-wide plan mixes unrelated forms/sections, making adjacency-based phone/address refinement and correction caching unreliable.

### 7. Custom controls and reactivity need dedicated adapters — P1

${customFields} custom fields on ${customSites} sites require live-browser execution. Extractor recognizes ARIA listbox/radiogroup/checkbox/textbox roles, but actuator only has explicit custom-combobox handling. Code inspection also shows detached controlled nodes can be verified through stale references.

### 8. Frame/cache verification contains untested safety risks — P0/P1

Code inspection found:

- every frame emits local \`fp-*\` IDs while descriptors always report frame 0; frame-broadcast messages can collide;
- cache-hit reconstruction bypasses fresh prefilled/sensitive checks;
- verifier reads stored elements without confirming \`isConnected\`;
- verification waits only about 300 ms and compares normalized raw strings, without validity or visible-error checks.

These are not claimed as live reproductions in this static pass. They are high-priority E2E targets because failure could produce false-green or unsafe fills.

## Safety findings

- No submit behavior exists in actuator; submit/button/image/reset controls are excluded.
- No final controls were clicked in QA.
- ${sensitiveSkipped} sensitive fields were skipped.
- ${prefilledPreserved} prefilled fields were preserved in cold mapping.
- Six honeypot/consent/marketing controls were still planned ready and require explicit policy exclusion.
- Cache safety must be reapplied at execution time; cold-path protection alone is insufficient.

## Blocked or stale targets

These should be replaced before claiming 100 fully testable Chrome E2E sites:

| # | Site | Country | Reason |
|--:|:--|:--|:--|
${blockedRows}

## Passing static-engine examples

${passing.map((result) => `- [${domain(result.url)}](${result.url}) — ${result.correctReady}/${result.eligibleFields} expected fields correctly mapped and verified.`).join("\n")}

## Full 100-site matrix

| # | Site | Country | Stack / scope | Preview oracle | Native fill/verify | Status | Finding |
|--:|:--|:--|:--|:--|:--|:--|:--|
${matrixRows}

## Prioritized fix plan

No fixes were applied during QA. Implement in batches; reload only after each phase is complete and automated gates pass.

### Phase 1 — Safety invariants and frame correctness (P0)

1. Make RPC frame-aware: namespace field IDs by tab/frame/document; collect frame responses; route plans/fills only to owning frame; mount one top-level preview.
2. Reapply sensitive, prefilled, honeypot, file, consent/legal, and marketing exclusions after cache lookup and immediately before actuation.
3. Re-resolve target elements at execution/verification; reject detached nodes.
4. Isolate errors per field so one unsupported control cannot abort remaining safe fills.
5. Add explicit submit/navigation guards to QA builds.

Acceptance gates:

- zero cross-frame writes in nested same-origin and cross-origin fixtures;
- zero writes to prefilled, sensitive, honeypot, file, consent, or marketing controls on cold and warm-cache runs;
- zero final submissions/navigation events.

### Phase 2 — Mapping precision and form scoping (P1)

1. Parse \`autocomplete\` tokens before label heuristics.
2. Match specific semantics before generic terms: company name, organization, company website, country, first name, and last name before generic “name.”
3. Scope extraction/plans by form or coherent section; never refine phone/address runs across form boundaries.
4. Validate prompt-returned keys against allowed profile keys and preserve model-selected option values.
5. Add regression snapshots from wrong-company and split-name examples in this report.

Acceptance gates:

- company, person-name, email, phone, address, and country precision/recall each ≥95% on saved 100-site snapshots;
- zero wrong/unexpected ready mappings;
- multi-form pages produce separate plans.

### Phase 3 — Controls and reactive frameworks (P1)

1. Introduce typed \`controlKind\` plus adapters for native text/select, radio groups, checkbox, ARIA combobox/listbox/radiogroup/checkbox/textbox, and contenteditable.
2. Group radios once; choose option by semantic value/text. Never treat radio values as booleans.
3. Scope combobox popup options through \`aria-controls\`/\`aria-owns\` and owning root.
4. Emit framework-safe input sequences; settle mutations; re-resolve rendered elements.
5. Re-extract after choices reveal conditional fields; support wizard passes.

Acceptance gates:

- correct retained selection for native and ARIA radio/select/combobox fixtures;
- React/Vue controlled fields remain filled at immediate, settled, and +2-second checks;
- conditional forms discover newly revealed fields without touching submit controls.

### Phase 4 — Internationalization and option resolution (P1)

1. Preserve Unicode during fuzzy normalization/tokenization.
2. Add multilingual semantic dictionaries for all 36-country matrix languages.
3. Use \`Intl.DisplayNames\`, ISO codes, and aliases for country options.
4. Remove fixed 20/50-option correctness limits; use bounded searchable indexes instead.

Acceptance gates:

- localized French, Spanish, Portuguese, Polish, Czech, Swedish, Japanese, Thai, Indonesian, Vietnamese, and Arabic fixtures pass;
- country selection ≥95% across localized option lists.

### Phase 5 — Validation, verification, cache, and correction UX (P1/P2)

1. Capture \`minLength\`, \`min\`, \`max\`, \`step\`, \`inputMode\`, \`aria-required\`, patterns, and transform warnings.
2. Verify connected visible DOM at immediate, settled, and +2-second checkpoints.
3. Check HTML validity, \`aria-invalid\`, and visible error text; normalize masks and select semantics.
4. Save mappings only after successful verification or explicit confirmed correction; preserve repeated fields in cache keys.
5. Recompute value/status immediately when preview corrections change profile key or transform.

Acceptance gates:

- zero false-green results on controlled/detached fixtures;
- zero invalid values shown as ready success;
- failed mappings never enter cache;
- preview corrections update current fill, not only future runs.

### Final Chrome E2E gate

After fixes are batched and one reload is available:

1. Replace nine blocked/stale URLs with comparable public forms.
2. Run 100/100 in Chrome with hardcoded QA profile.
3. Capture preview, filled DOM, immediate/+2-second retention, validity, page errors, frame identity, and safety guards.
4. Apply no fixes during that run.

Release target: ≥90 pass, remainder explained partial, zero fail, zero unsafe writes, zero submissions, zero sensitive/prefilled/cache regressions.

## Evidence artifacts

- \`site-pool.md\` — 100-site, 36-country matrix.
- \`live-dom-results.json\` — full field-level raw results and per-site evidence.
- \`in-the-wild-report.md\` — this report.
- QA harness: \`scripts/live-dom-qa.test.ts\` with \`vitest.live.config.ts\`.
- QA-only hardcoded profile is build-gated by \`FORMPILOT_QA_PROFILE=1\`; normal builds still require a saved profile.
- Build inspection: synthetic values absent from normal build and present in QA build; final \`dist/chrome-mv3\` is QA-enabled and reload-ready.
- Final verification: TypeScript compile, 8 test files / 17 tests, and Chrome MV3 build all green.
`;

writeFileSync(outputPath, report);
