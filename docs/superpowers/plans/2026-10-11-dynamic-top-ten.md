# Dynamic recommendations and top ten combinations

User-approved design: recommendation score = 0.6 * high-skill winrate + 0.4 * (50 - clamp(overall average pick position, 1, 50))/49. Missing high-skill winrate falls back to overall with a visible explanation; no valid inputs means no rank. Skills and models share ONE mixed ranking, per the user correction, explicit prefixes, gold top 3 and teal 4–10. Recompute from the current scan and exclude all recognized picked skills even when cached pool entries remain.

- [x] Add pure scoring/current-pool/pair-top-ten tests; verify Shukuchi outranks Bash.
- [x] Read live database statistics and all recorded pool pairs via a bounded read-only IPC handler, ignore stale async responses.
- [x] Add top-ten pair panel with saved show/hide preference and Chinese names; unavailable combinations disappear after scans.
- [x] Validate renderer at 4K/150%, all tests, build, actual installed data IPC and startup.
- [x] Back up current archive; preserve original main code except for the new read-only handler and replace renderer; restart application.

Verified: 1035 passing tests; 1 skipped. Production build and 4K/150% UI fixture passed, including mixed rank prefixes and panel show/hide. Installed IPC returned 513 abilities, 127 models, and 2 sample pool pairs; installed renderer startup/localized search passed. Existing upstream 54 web type errors remain; no new error categories. Original installed main preserved with one read-only handler inserted. Previous local archive backed up at output/backups/20261011-before-mixed-ranking/app.asar. Live gameplay not exercised.
