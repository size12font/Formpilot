# Cloud-assisted matching

Cloud-assisted matching is optional and disabled by default.
Enable it in the profile editor and save the setting.
It preserves reliable local matches and saved corrections, then asks Jev to select a candidate ID for unresolved fields.
FormPilot resolves the saved value, formats it locally, and shows the existing preview before filling.
It never submits the form.

## Set up the broker

Use Node.js 22.18 or newer and the repository's pnpm dependencies.
The broker calls the official [TypeSafe HTTP API](https://docs.typesafe.ai/api) using [Choice questions](https://docs.typesafe.ai/primitives/choice).
The API contract and [candidate-selection cookbook](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook) were checked on September 29, 2026.

1. Build the extension with `pnpm build` and load `dist/chrome-mv3` in Chrome.
   Copy its ID from the Chrome extensions page.
2. Copy `server/.env.example` to `server/.env` and restrict the file to its owner.
   Put the TypeSafe provider key in `TYPESAFE_API_KEY` on the broker host only.
3. Generate an individual broker access token with `node -e 'console.log(require("node:crypto").randomBytes(36).toString("base64url"))'`.
   Put it in `FORMPILOT_BROKER_TOKENS` and enter the matching `chrome-extension://EXTENSION_ID` in `FORMPILOT_EXTENSION_ORIGINS`.
   Both environment variables accept comma-separated entries.
4. Start the broker from the repository root:

   ```sh
   node --env-file=server/.env --experimental-strip-types server/matchingBroker.ts
   ```

5. In the profile editor, enable Cloud-assisted matching.
   Enter `http://127.0.0.1:8787/match` as the service address and the individual broker token as the access token.
   Choose Save connection, then Save at the top of the editor.
6. Open a form, request a preview, review the suggestions, and choose Fill.

The provider key never enters the extension.
The broker token is kept in Chrome session storage, available only to trusted extension contexts by Chrome's default access policy.
Reconnect after restarting the browser.
Disconnect removes the session token.
Turning off Cloud-assisted matching prevents cloud requests even if a connection remains saved.
Missing credentials, a failed request, or a timeout leaves uncertain fields for manual review while reliable local matches remain available.

For a remote broker, use an HTTPS reverse proxy in front of the loopback listener and enter its `/match` URL.
Only HTTPS and the explicit local loopback HTTP address are accepted by the extension.
The proxy must not log authorization headers or request/response bodies.
No service was deployed and no production settings were changed for this implementation.

## Data sent to the service

The request schema permits only a rules version and up to 12 field descriptions.
Each description contains an opaque request ID, sanitized label and placeholder, sanitized section context, a control category, optional maximum length, and at most 48 candidate IDs with fixed role descriptions.
Examples of roles are `work email`, `mobile phone number`, and `billing postal code`.

Sanitization removes known saved and entered values, URLs, email addresses, digits, and words outside a fixed field-description vocabulary.
Labels, placeholders, and section context are limited to 20 words and 180 characters each.
The broker independently rejects text outside that vocabulary and rejects unknown request properties.
No profile values, custom field names, input values, DOM IDs, field names, URLs, page titles, nearby page text, screenshots, dropdown contents, or complete field descriptors leave the device.
Autocomplete hints are not sent to Jev.

Unknown custom labels and document identifiers remain manual in assisted mode unless the user has saved a correction.
Profile roles must use the recognized labels in `cloudProfileCandidates`, such as `personal`, `work`, `home`, `billing`, `shipping`, or `mobile`.
Imported profiles can contain several emails and addresses; editing the first entry preserves the rest.
Indistinguishable roles are excluded instead of selecting the first array entry.
If sanitization removes needed context, the field remains unresolved.
This conservative vocabulary limits support for unfamiliar labels and languages.

## Rules and failure handling

Payment, bank, password, OTP, prefilled, consent, hidden, and other existing exclusions run before inference and again before filling.
Role and identifier checks run in ordinary code.
Company registration fields cannot select a personal tax ID, and billing postal fields cannot select a home postal code.
Suspicious instructions and negated labels remain unresolved.
Jev can return `NO_MATCH` when available roles do not answer the field.
Invalid IDs, extra response properties, duplicate responses, and malformed probabilities are rejected.

Formatting, dates, phone splitting, dropdown matching, and filling remain local.
The cloud response cannot supply a value, transform, or dropdown option.
The provisional acceptance threshold is 0.85 for both Choice confidence and selected-option probability at the broker.
The client rechecks confidence and membership before accepting a selection.
This threshold has not been evaluated on held-out live examples.
TypeSafe's [confidence documentation](https://docs.typesafe.ai/confidence) distinguishes confidence from correctness.

The extension makes at most one request per extracted frame per preview, with up to 12 unresolved fields.
Additional fields stay available for manual review.
Request bodies are limited to 24 KB.
The extension waits at most 2.5 seconds; the broker allows 2 seconds and no automatic retries.
Provider responses are limited to 64 KB; broker responses to the extension are limited to 24 KB.
The broker permits four concurrent requests, ten requests per minute per access token, and one hundred per day per token.
These quotas are in memory and reset when the process restarts.
Use a persistent shared quota store before operating multiple broker processes or requiring durable billing limits.
The broker emits no content or credential logs.

## Cache and freshness

Assisted signatures include the mapping-rules version, full field context, profile contents and roles, candidate order, URL context, and page language in a local hash.
They are never transmitted.
Only verified fills and explicit corrections use the existing persistent signature cache; raw cloud results are not stored there.
Legacy manual mappings are bound to the first assisted context that adopts them, preventing reuse after profile roles or indexes change.
Verified automatic mappings cannot replace manual mappings or saved skips.

Before displaying an assisted preview and before filling it, FormPilot re-extracts the current documents and checks the local context fingerprint.
Navigation, field changes, profile edits, and settings changes invalidate the old preview.
New requests and manual corrections also update a per-tab request generation in session storage.
A late response cannot replace a preview edited while that response was pending.
The existing actuator still checks live field safety immediately before writing.

## Verification and live evaluation

```sh
pnpm verify
pnpm test:browser:fixtures
```

The browser suite uses the real broker with an injected, scripted provider response.
It verifies the preview, actual Fill button, retained values, protected fields, settings, stale responses, and absence of submission.
The unit suite writes `qa-results/jev-matching/fixture-comparison.json` using the same 18 synthetic fixtures in both modes.
Local-only results exclude Chrome's optional LanguageModel, which is unavailable in the unit environment.
Assisted responses are scripted from fixture roles, so this comparison measures integration behavior and cannot establish an accuracy improvement.

Live inference is unverified because no TypeSafe key or broker tokens were configured in the test environment.
To evaluate Jev, configure the real broker, use synthetic profiles, and label a separate held-out set of forms before requesting predictions.
Count correct matches, incorrect matches, and abstentions separately in both modes, record the returned model version and latency, and tune thresholds on a separate development set.
Keep incorrect fills visible in the report rather than counting them as coverage.
