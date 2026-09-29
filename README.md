# FormPilot

Chrome MV3 extension for preview-first local form filling.

## What is implemented

- WXT + TypeScript + Preact extension scaffold.
- Chrome 138+ MV3 manifest with module service worker.
- Popup trigger, options profile editor, local profile storage, optional AES-GCM encrypted storage.
- DOM field extraction with labels, nearby text, open shadow roots, same-origin iframe traversal.
- Sensitive-field skipping for payments, passwords, OTP, bank fields.
- Deterministic transforms for dates, phone, country, select matching, length/pattern warnings.
- Local Chrome Prompt API adapter isolated behind `promptClient`.
- Optional cloud-assisted matching through an authenticated Jev broker, disabled by default.
  Saved values stay local; the service selects from described candidate IDs.
- Local heuristic mapper fallback for unsupported Prompt API environments.
- Preview overlay, user corrections, signature cache, actuation, verification.
- Fixture forms for plain, German, payment, hostile, ARIA, wizard, and legacy table layouts.

## Commands

```sh
pnpm install
pnpm verify
pnpm qa:fixtures
pnpm dev
pnpm build
```

Load unpacked extension from:

```text
dist/chrome-mv3
```

## Local fixture QA

Run `pnpm qa:fixtures`, then use HTTP fixture targets instead of `file://` pages:

```text
http://127.0.0.1:8765/
http://127.0.0.1:8765/fixtures/plain/contact.html
```

Keep the fixture server running while using Chrome Preview/Fill QA.

## Current verification

Run `pnpm verify` for type checking, unit/integration tests, and the production build.
Run `pnpm test:browser:fixtures` for Chromium fixture tests with a synthetic QA profile.

The only extension network boundary is the opt-in matching broker client.
See [cloud matching setup and limits](docs/cloud-matching.md) and the [verification report](qa-results/jev-matching/README.md).
