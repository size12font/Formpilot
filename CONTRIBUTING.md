# Contributing

Thanks for helping improve FormPilot.

## Development

```bash
pnpm install
pnpm verify
pnpm test:browser:fixtures
```

## Safety requirements

Changes that affect extraction, mapping, actuation, storage, or verification must preserve these invariants:

- no form submission or post-fill navigation;
- no writes to passwords, payments, OTPs, banking fields, files, consent controls, honeypots, or hidden traps;
- no overwrite of prefilled fields without explicit user action;
- no external network fallback for profile or form data;
- every proposed write remains visible in the preview.

Add a focused unit or integration regression test. Use repository fixtures and the synthetic QA profile for browser coverage; never commit real personal data.

Keep pull requests focused and explain the user-visible behavior, risk boundary, and validation performed.
