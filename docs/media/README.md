# Public demonstration media

These files show **synthetic data in the actual recommendation engine and React overlay components**. They are not game captures, match results, or current-patch statistics.

- `recommendation-demo.gif`: 12-second, four-step loop for the README.
- `recommendation-demo.webm`: the same sequence as a smaller video.
- `recommendation-demo.png`: static frame after selecting Dragon Knight as the user's model.

The schematic skill cards intentionally use Chinese glyphs instead of game screenshots. No player names, private database contents or personal API credentials are included.

Sequence: base recommendation → select a model → recognize an owned ability → remove an ability picked by someone else. Each frame uses `recommendDraft`, `buildDraftBadges`, `BestChoicePanel`, `TopCombinationsPanel` and `DraftBadges`; the generator checks that the best-pick card and badge 1 agree and that unavailable choices are removed.

To regenerate on the documented Windows environment:

```sh
node scripts/create-public-demo.mjs
```

Run from the repository root after installing dependencies. Chrome and FFmpeg are required. Override their executable paths with `CHROME_PATH` and `FFMPEG_PATH` if needed. Intermediate fixtures, screenshots and verification results are written under ignored `output/public-demo/`; only the three public media files above are intended for publication.
