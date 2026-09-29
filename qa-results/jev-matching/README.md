# Jev matching verification

Verified September 29, 2026, on branch `codex/jev-field-matching`.
Implementation and test artifacts are in an isolated worktree based on `9a75f0236f2c3195a260d6f1df6ba10435ed4d74`.
Unrelated source changes in the original checkout were preserved.

## Results

- `pnpm verify` passed type checking, 117 tests across 21 files, and the production extension build.
- `pnpm test:browser:fixtures` passed all 12 Chromium fixtures.
- Native Node loaded the broker module and constructed the broker with synthetic configuration and no inference request.
- `git diff --check` passed.

The assisted browser fixture used the real authenticated broker with a scripted provider response.
The actual rendered Fill button filled the exact saved first name, family name, work email, and billing postcode after preview.
The company registration field, password, and prefilled email stayed unchanged.
The form's submission marker remained unset.
Additional browser checks covered the opt-in setting, session-only broker credentials, delayed responses after navigation or field/profile edits, manual corrections during an outstanding request, and stale previews at fill time.
The original browser fixtures covered cross-origin frames, protected controls, complex controls, and reactive replacement fields.

Unit and integration checks covered role selection, multilingual labels, misleading autocomplete, missing candidates, `NO_MATCH`, response validation, timeouts, payload privacy, exclusions, zero requests when disabled, cache invalidation, concurrent cache updates, saved skips, dropdown validation, and local phone splitting.

## Synthetic comparison

Both modes ran the same 18 fixtures with synthetic profiles.
An abstention means no ready value was proposed; expected abstentions are a subset of that total.

| Mode | Correct matches | Incorrect matches | Abstentions | Expected abstentions |
| --- | ---: | ---: | ---: | ---: |
| Local-only heuristics | 4 | 9 | 5 | 3 |
| Assisted with scripted responses | 11 | 0 | 7 | 7 |

These are integration results, not a Jev accuracy comparison.
Scripted responses select the expected fixture roles, and the unit environment has no Chrome LanguageModel.
The fixtures deliberately include ambiguous roles and misleading hints.
No claim about live accuracy follows from these counts.
The 0.85 confidence/probability thresholds remain provisional until a held-out live evaluation is completed.

Detailed rows are in [fixture-comparison.json](fixture-comparison.json).
The full browser result is in [browser-fixtures.json](browser-fixtures.json).

## Screenshots

[Preview before filling](assisted-preview.png), [values after filling](assisted-filled.png), and [cloud settings](cloud-settings.png) were captured from the tested Chromium extension and visually inspected.
They contain synthetic data only.

## Remaining setup

Live Jev inference is unverified.
No TypeSafe key or broker access tokens were configured in the test environment.
Follow [the broker setup instructions](../../docs/cloud-matching.md) to configure a server-side provider key, an individual broker token, and the extension origin.
No deployment or production configuration change was made.
The final worktree extension bundle uses the production build without the synthetic QA fallback.

The requested TypeSafe skill was scanned before installation.
SkillSpector reported LOW risk, score 10/100, with two license-text warnings and no executable scripts.
The skill was installed in the original project's `.agents/skills/typesafe-ai` directory and read directly for this work.
Restart Codex to load the new skill automatically in later chats.
