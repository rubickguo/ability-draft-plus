import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'

// Input: saved public aggregate API responses only. Never read a player's database.
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/build-public-seed.mjs <aggregate-responses.json>')
const raw = JSON.parse(fs.readFileSync(input, 'utf8'))
for (const key of ['static/abilities', 'static/heroes', 'abilities', 'ability-high-skill', 'ability-pairs'])
  assert(raw[key]?.data, `Missing public aggregate endpoint: ${key}`)
const patches = raw.abilities.data.patches.overall
assert.deepEqual(raw['ability-high-skill'].data.highSkillData.patches.overall, patches)
assert.deepEqual(raw['ability-pairs'].data.patches.overall, patches)
const sourceDate = new Date(raw.abilities.data._lastUpdated).toISOString()
const generated = path.resolve('output/public-seed-tools.cjs')
await build({
  stdin: { contents: `
    export * from './src/core/database/schema';
    export * from './src/core/database/repositories/hero-repository';
    export * from './src/core/database/repositories/ability-repository';
    export * from './src/core/database/repositories/synergy-repository';
    export * from './src/core/database/repositories/metadata-repository';
    export * from './src/core/database/ranking-evidence';
    export * from './src/core/scraper/data-transformer';
    export * from './src/core/scraper/slot-metadata-overrides';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, packages: 'external', platform: 'node', format: 'cjs', outfile: generated,
  alias: { '@core': path.resolve('src/core'), '@shared': path.resolve('src/shared') },
})
const core = createRequire(import.meta.url)(generated)
const SQL = await initSqlJs()
const sqlite = new SQL.Database()
sqlite.run(core.SCHEMA_SQL)
const db = drizzle(sqlite)
const heroes = core.createHeroRepository(db)
const abilities = core.createAbilityRepository(db)
const synergies = core.createSynergyRepository(db)
const metadata = core.createMetadataRepository(db)
const overallStats = raw.abilities.data.abilityStats
const hsStats = raw['ability-high-skill'].data.highSkillData.abilityStats
const abilityLookup = core.buildAbilityLookup(raw['static/abilities'].data)
const staticHeroes = raw['static/heroes'].data
const transformed = core.transformAbilitiesAndHeroes(overallStats, hsStats, abilityLookup, staticHeroes)
const heroIds = heroes.upsertHeroes(transformed.heroData)
abilities.upsertAbilities(transformed.abilityData, heroIds)
abilities.setSlotMetadata(Object.entries(core.SLOT_METADATA_OVERRIDES).map(([name, rule]) => ({
  name, abilityOrder: rule.abilityOrder, isUltimate: rule.isUltimate,
})))
const abilityIds = abilities.getNameToIdMap()
const pairs = raw['ability-pairs'].data.abilityPairs
const transformedPairs = core.transformPairs(pairs, core.buildWinrateMap(overallStats), abilityLookup, staticHeroes)
synergies.clearAndInsertAbilitySynergies(transformedPairs.abilityPairs, abilityIds)
synergies.clearAndInsertHeroAbilitySynergies(transformedPairs.heroPairs, abilityIds, heroIds)
metadata.setLastScrapeDate(sourceDate)
core.captureRankingEvidence(metadata, { overallStats, hsStats, abilityLookup, staticHeroes, pairs, sourceDate, patches })
for (const table of ['PlayerAbilityStats', 'PlayerHeroStats', 'AbilityTriplets', 'HeroAbilityTriplets'])
  assert.equal(sqlite.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0], 0)
const keys = sqlite.exec('SELECT key FROM Metadata')[0].values.flat()
assert(keys.every(key => ['last_successful_scrape_date', core.RANKING_EVIDENCE_KEY].includes(key)))
assert.equal(sqlite.exec('PRAGMA integrity_check')[0].values[0][0], 'ok')
fs.writeFileSync('resources/dota_ad_data.db', sqlite.export())
const manifest = {
  source: 'Windrun public aggregate API', sourceDate, patches,
  abilities: transformed.abilityData.length, heroModels: transformed.heroData.length,
  abilityPairs: transformedPairs.abilityPairs.length, heroAbilityPairs: transformedPairs.heroPairs.length,
  personalRecords: 0,
  omitted: ['Triplets and role-shift enrichment are fetched on the next successful online update.'],
}
fs.writeFileSync('resources/data/public-seed-manifest.json', JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(manifest, null, 2))
sqlite.close()
