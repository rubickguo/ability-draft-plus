# Contextual draft recommendations

Approved scope: one mixed ranking and one best choice, based on Windrun statistics,
the player's model, owned abilities, role preference and actual snake draft order.
Enemy denial is restricted to a near-best set of useful personal choices. It must
not consume a slot for an unsupported or already completed enemy combination.

Baseline: `964a60c`, tag `baseline/2026-10-11-before-context-ranking`, pushed to
the user's fork before any optimization. Preserve official Chinese names and the
installed recognition code. Do not edit Dota files.

## Execution

- [x] Retain available and owned ability/model evidence in one ranking payload.
- [x] Preserve sample counts where available; unknown evidence remains unknown.
- [x] Build and test a pure recommendation function with legal candidates,
  conservative pair adjustments, role preference, real turn gaps and constrained
  denial. Scores are recommendation indices, not match win probabilities.
- [x] Recompute on accepted scans and user spot/model/role changes immediately.
- [x] Render one best choice, mixed numeric ranks and a collapsible threat list.
  Remove conflicting old priority highlights. Keep capture decorations hidden.
- [x] Repair original own-pick synergy filtering as a targeted compatibility fix.
- [x] Run unit tests, production build, UI fixtures and installed smoke checks.
- [x] Package a minimal main-process patch and renderer files, preserving all
  other installed resources and recognition code. Back up before deployment.
- [x] Commit and push the finished improvement separately from the baseline.

## Required regression scenarios

1. Own selected ultimate/model excludes every other choice in that filled slot.
2. An enemy holding half a pair retains the remaining item as an actionable threat.
3. A teammate's pair and two different enemies' picks cannot become an enemy combo.
4. Completed combinations cannot claim to be blockable.
5. Insufficient sample or turn evidence cannot force a denial recommendation.
6. Expensive denial cannot displace clearly better own choices.
7. Seat, model and role changes recompute without another screenshot.
8. First-choice card and badge #1 use the same result, with stable ties.
9. Missing recognition/turn data yields explicit degraded guidance, not fake odds.

## Verification boundaries

Historical aggregate win rates support relative recommendations, not causal
improvement claims. Sample smoothing and heuristic tolerances must be documented.
The existing upstream web TypeScript errors are recorded in ignored local output;
no new diagnostics in changed files may be dismissed as upstream failures.

## Verified result (2026-10-11)

- 70 test files passed: 1093 tests passed, one existing test skipped.
- Production build and 4K / 150% UI fixture passed. First card, badges, Chinese
  labels, enemy half-combos, visibility toggle and capture hiding agree.
- Installed app starts with no renderer errors; ranking IPC works, Windrun
  refresh captured patch 7.41f samples, and 640 sample records persist across restart.
- ASAR check preserved 14619 original entries including 513 unpacked references;
  renderer replaced, standalone ranking provider added, five reversible main edits.
- Independent review drove regressions for real empty slots, active automatic
  role inference, unknown models and both directions of model compatibility.
- Type checks retain 54 web / 19 node pre-existing diagnostics; new ranking
  files add none. These checks are not represented as passing.
- Live match accuracy remains to be exercised by the player; fixtures validate
  decision behavior, not empirical win-rate gains.

See `docs/contextual-ranking.zh-CN.md` for the formulas, policy constants and use.
