import assert from 'node:assert/strict'

/** Version-specific, reversible edits. Refuse unknown binaries instead of replacing recognition code. */
export function patchInstalledMain(original) {
  assert(!original.includes('draft:getRankingData'), 'Package from the pre-ranking baseline backup')
  let updated = original
  const edits = []
  const replace = (before, after) => {
    assert.equal(
      updated.split(before).length,
      2,
      `Expected one patch anchor: ${before.slice(0, 90)}`,
    )
    updated = updated.replace(before, after)
    edits.push({ before, after })
  }
  const helper = 'require("./contextual-ranking-extension.cjs")'
  replace(
    'function registerDatabaseHandlers(dbService, backupService) {',
    `function registerDatabaseHandlers(dbService, backupService, getDraftState) {\n\telectron.ipcMain.handle("draft:getRankingData", (_event, data) => ${helper}.getDraftRankingData(dbService, data, getDraftState?.()));`,
  )
  replace(
    'registerDatabaseHandlers(dbService, backupService);',
    'registerDatabaseHandlers(dbService, backupService, () => draftStore.getState());',
  )
  replace(
    'const heroNameToIdMap = deps.heroes.upsertHeroes(heroData);',
    `deps.metadata.set(${helper}.RANKING_EVIDENCE_KEY, "");\n\t\tconst heroNameToIdMap = deps.heroes.upsertHeroes(heroData);`,
  )
  replace(
    'deps.metadata.setLastScrapeDate(now);',
    `deps.metadata.setLastScrapeDate(now);\n\t\t${helper}.captureRankingEvidence(deps.metadata, { overallStats, hsStats, abilityLookup, staticHeroes, pairs: pairsRes.data.abilityPairs ?? [], sourceDate: now, patches: abilitiesRes.data.patches.overall });`,
  )
  replace(
    'if (state.mySelectedSpotDbId !== null) for (const slot of selectedAbilities) {\n\t\tif (!slot.name) continue;',
    'if (state.mySelectedSpotHeroOrder !== null) for (const slot of selectedAbilities) {\n\t\tif (!slot.name || slot.hero_order !== state.mySelectedSpotHeroOrder) continue;',
  )
  let restored = updated
  for (const { before, after } of [...edits].reverse()) restored = restored.replace(after, before)
  assert.equal(restored, original, 'Main must be byte-identical outside the five documented edits')
  return { updated, edits: edits.length }
}
