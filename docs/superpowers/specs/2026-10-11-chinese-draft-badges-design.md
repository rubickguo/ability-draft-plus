# Chinese draft names and visual pick guidance

Approved by the user: implement directly; all app surfaces must use official Dota 2 Simplified Chinese names when Chinese is selected.

Read official names from installed Valve localization resources. Keep internal identifiers and database statistics unchanged. Resolve English display aliases in one shared resolver used at renderer boundaries, including combo lists, tooltips, statistics, picks and streaming views. Use Chinese fallback UI strings and correct average pick position terminology.

Add separate skill and model pick-position ranks: lowest valid average pick position gets #1; unknown/null positions are not ranked; picked choices are excluded. Strong combinations share stable purple letter badges across all participating skill/model icons and corresponding combo rows. Badge positions avoid existing Aghanim markers, preserve pointer handling and DPI scaling. Available combinations only; picked own abilities may remain visible as combo anchors. Trap combos receive Chinese labels but never strong-combo badges.

Verify official-name coverage against the installed statistics database; tests for ranking, ties, unknowns, model/ability combinations, renderer names and language switching; build a separate local Windows app before installing the tested update with original package backup.
