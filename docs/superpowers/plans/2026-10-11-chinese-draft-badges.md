# Chinese draft badges implementation plan

Goal: show official Chinese names everywhere and identify pick priority and strong-combo membership on icons.

Architecture: shared Valve-name resolver at display boundaries; deterministic overlay-only badge builder using current enriched scan data; retain upstream scan and scoring behavior.

Tech stack: Electron, React, TypeScript, Vitest, Valve VPK localization resources.

- [x] Extract official zh-CN tokens; add failing resolver tests; implement aliases and coverage checks.
- [x] Add failing ranking/combination tests; implement deterministic builder excluding picked or unknown choices.
- [x] Integrate badges in skill/model hotspots and combination panel; localize every renderer name surface and dynamic messages; correct pick-position labels.
- [x] Run targeted tests, full regression tests, type checks and production build; inspect rendered fixture at 150% equivalent scaling.
- [x] Package and deploy local app with original app archive retained; verify startup and report any live-draft validation limits.

Verification: 1032 tests passed, 1 skipped. Production build passed. 4K/150% browser fixture and installed Electron Chinese name/filter/pagination checks passed. Existing upstream web type errors remain (138 baseline, 54 after namespace fixes; no newly introduced file/error categories). Original archive retained in output/backups/20261011-chinese-badges/app.asar. All 14620 non-renderer entries preserved; 25 renderer files replaced. Live draft not exercised.
