# TypeSafe rollout

Development-only synthetic metadata comparison against createFillPlan. Browser Prompt API is unavailable in the test environment, so the measured local baseline is its existing fallback. No profile values go to TypeSafe. No extension runtime source, credential, manifest permission or network dependency changed. Keep the extension local.

## Evaluation

Ordinary test runs preserve the recorded baseline. To export a new local measurement, run `TYPESAFE_BASELINE_OUTPUT=scripts/typesafe/baseline.json pnpm exec vitest run tests/unit/typesafeBaseline.test.ts`.

Fixtures and expected labels were saved before inference. Calibration and holdout cases are distinct synthetic examples. These results do not establish precision on live users.

```json
{
  "local": {
    "accuracy": 0.9166666666666666,
    "wrongMappings": 2,
    "abstentions": 9,
    "meanLatencyMs": 0.4075017083333279
  },
  "typesafe": {
    "accuracy": 1,
    "wrongMappings": 0,
    "abstentions": 9,
    "meanLatencyMs": 241.04166666666666
  }
}
```

Model: `jev-1.13.0`. Price verified on 2026-10-04: $0.042 per million input tokens; output tokens free. Every call reserves $0.01 before sending, reconciles validated usage, and retains the full reservation after an ambiguous failure. No automatic retry or allowance reset.

Local ledger: `/Users/johnnyquach/Documents/Codex/2026-10-04/go-t/work/budgets/formpilot.sqlite`. Reuse this existing ledger. Never create another allowance for the same rollout. Kura and Kobe local ledgers are closed after transferring only the remaining balance to production. Public fixtures may be cached by input, questions, version and model. Private application content is never cached. Operational metrics exclude the input text.

## Rollback

Disable the optional inference first. Revert the TypeSafe change commit if needed. Retain the spending ledger, reservations and consumed balance across rollback and redeployment. Never replace it with a fresh allowance. Research skill backups are in the rollout workspace under `work/backups/research`.
