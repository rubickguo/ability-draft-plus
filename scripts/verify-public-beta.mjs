import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import asar from '@electron/asar'
import initSqlJs from 'sql.js'
import { _electron as electron } from '@playwright/test'

// Standalone Windows release gate. No installed application/profile is opened,
// no online update is requested, and the private test profile is kept for diagnosis.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const valueOf = (flag, fallback) => {
  const index = args.indexOf(flag)
  if (index < 0) return fallback
  assert(args[index + 1] && !args[index + 1].startsWith('--'), `Missing value for ${flag}`)
  return path.resolve(args[index + 1])
}
const executable = valueOf(
  '--executable',
  path.join(project, 'dist/win-unpacked/Ability Draft Plus CN Beta.exe'),
)
const output = valueOf('--output', path.join(project, 'output/public-beta-smoke'))
const staticOnly = args.includes('--static-only')
const resources = path.join(path.dirname(executable), 'resources')
const report = { mode: staticOnly ? 'static' : 'packaged', executable, passed: false }
fs.mkdirSync(output, { recursive: true })
let application

function yamlValue(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, 'm'))
  return match?.[1].replace(/^['"]|['"]$/g, '')
}

async function verifyResources() {
  assert(fs.existsSync(executable), 'Build the unpacked public Beta before running this check')
  assert.equal(path.basename(executable), 'Ability Draft Plus CN Beta.exe')
  const config = JSON.parse(fs.readFileSync(path.join(resources, 'app-config.json'), 'utf8'))
  assert(
    config && !Array.isArray(config) && typeof config === 'object',
    'Invalid app-config object',
  )
  for (const key of [
    'API_ENDPOINT_URL',
    'CLIENT_API_KEY',
    'CLIENT_SHARED_SECRET',
    'SENTRY_DSN',
    'CLIENT_TAG',
    'TWITCH_EBS_URL',
  ]) {
    // Never print a rejected config value; build logs must not expose credentials.
    assert(config[key] === '', `Public app-config must have an empty ${key}`)
  }
  assert(
    Object.values(config).every((value) => value === ''),
    'Public app-config contains a nonempty value',
  )
  const updater = fs.readFileSync(path.join(resources, 'app-update.yml'), 'utf8')
  assert.equal(yamlValue(updater, 'provider'), 'github')
  assert.equal(yamlValue(updater, 'owner'), 'rubickguo')
  assert.equal(yamlValue(updater, 'repo'), 'ability-draft-plus')
  assert.equal(yamlValue(updater, 'releaseType'), 'prerelease')
  assert.equal(yamlValue(updater, 'channel'), 'beta')
  const archive = path.join(resources, 'app.asar')
  const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString())
  assert.equal(packaged.name, 'ability-draft-plus-cn')
  assert.match(packaged.version, /-beta\./)
  const main = asar.extractFile(archive, path.normalize(packaged.main)).toString()
  assert(
    main.includes('com.rubickguo.abilitydraftplus.cn'),
    'Missing community Beta application ID',
  )
  assert(main.includes('ability-draft-plus-cn-beta'), 'Missing separate community Beta profile')
  report.isolatedSmokeHookPresent =
    main.includes('adp-public-beta-smoke') && main.includes('ADP_PUBLIC_BETA_SMOKE_APP_DATA')
  const manifest = JSON.parse(
    fs.readFileSync(path.join(resources, 'data/public-seed-manifest.json'), 'utf8'),
  )
  assert.equal(manifest.source, 'Windrun public aggregate API')
  assert.equal(manifest.personalRecords, 0)
  assert(Number.isFinite(Date.parse(manifest.sourceDate)), 'Invalid seed source date')
  assert(Array.isArray(manifest.patches) && manifest.patches.length > 0, 'Missing seed patch')
  const SQL = await initSqlJs()
  const database = new SQL.Database(fs.readFileSync(path.join(resources, 'dota_ad_data.db')))
  try {
    const rows = (sql) => database.exec(sql)[0]?.values ?? []
    assert.equal(rows('PRAGMA integrity_check')[0][0], 'ok')
    const counts = {}
    for (const table of [
      'Heroes',
      'Abilities',
      'AbilitySynergies',
      'HeroAbilitySynergies',
      'PlayerAbilityStats',
      'PlayerHeroStats',
    ]) {
      counts[table] = rows(`SELECT COUNT(*) FROM ${table}`)[0][0]
    }
    assert.equal(counts.PlayerAbilityStats, 0)
    assert.equal(counts.PlayerHeroStats, 0)
    assert.equal(counts.Heroes, manifest.heroModels)
    assert.equal(counts.Abilities, manifest.abilities)
    assert.equal(counts.AbilitySynergies, manifest.abilityPairs)
    assert.equal(counts.HeroAbilitySynergies, manifest.heroAbilityPairs)
    assert(counts.Heroes > 0 && counts.Abilities > 0 && counts.AbilitySynergies > 0)
    const metadata = Object.fromEntries(rows('SELECT key,value FROM Metadata'))
    assert.deepEqual(Object.keys(metadata).sort(), [
      'draft_ranking_evidence_v1',
      'last_successful_scrape_date',
    ])
    const evidence = JSON.parse(metadata.draft_ranking_evidence_v1)
    assert.equal(evidence.sourceDate, manifest.sourceDate)
    assert.equal(metadata.last_successful_scrape_date, manifest.sourceDate)
    assert.deepEqual(evidence.patches, manifest.patches)
    const expectedSamples = Object.fromEntries(
      Object.entries(evidence.samples).map(([key, sample]) => [
        key,
        {
          numPicks: sample.numPicks,
          highSkillNumPicks: sample.highSkillNumPicks,
        },
      ]),
    )
    assert(
      Object.values(expectedSamples).some(
        (sample) => sample.numPicks > 0 && sample.highSkillNumPicks > 0,
      ),
    )
    // Evidence also retains source pairs intentionally excluded from the app
    // (e.g. two abilities from the same hero). Probe an actual stored pair.
    const storedPairKeys = new Set(
      rows(`SELECT a.name, b.name FROM AbilitySynergies AS s
        JOIN Abilities AS a ON a.ability_id = s.base_ability_id
        JOIN Abilities AS b ON b.ability_id = s.synergy_ability_id`).map((names) =>
        names
          .map((name) => `ability:${name}`)
          .sort()
          .join('|'),
      ),
    )
    const knownPair = Object.entries(evidence.pairs).find(
      ([key, pair]) => pair.numPicks > 0 && storedPairKeys.has(key),
    )
    assert(knownPair, 'Seed lacks pair sample evidence')
    report.resources = {
      version: packaged.version,
      configEmpty: true,
      updaterOwner: 'rubickguo',
      counts,
      sourceDate: manifest.sourceDate,
      patches: manifest.patches,
    }
    return { manifest, expectedSamples, knownPair }
  } finally {
    database.close()
  }
}

try {
  const seed = await verifyResources()
  if (!staticOnly) {
    // Refuse old packages before launch: --user-data-dir alone is overridden by
    // the app's intentional Beta profile separation.
    assert(
      report.isolatedSmokeHookPresent,
      'Rebuild the package with the isolated smoke profile hook before launching',
    )
    const profile = fs.mkdtempSync(path.join(tmpdir(), 'adp-public-beta-smoke-'))
    const expectedUserData = path.join(fs.realpathSync(profile), 'ability-draft-plus-cn-beta')
    report.temporaryAppData = profile
    report.temporaryUserData = expectedUserData
    application = await electron.launch({
      executablePath: executable,
      args: ['--adp-public-beta-smoke'],
      env: { ...process.env, ADP_PUBLIC_BETA_SMOKE_APP_DATA: profile },
      timeout: 45_000,
    })
    const actual = await application.evaluate(({ app }) => ({
      userData: app.getPath('userData'),
      appData: app.getPath('appData'),
      packaged: app.isPackaged,
    }))
    assert.equal(fs.realpathSync(actual.userData), fs.realpathSync(expectedUserData))
    assert.equal(fs.realpathSync(actual.appData), fs.realpathSync(profile))
    assert.equal(actual.packaged, true)
    const page = await application.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: '仪表盘', exact: true }).waitFor({ timeout: 20_000 })
    // Let the automatic first initialization finish before exercising the retry
    // IPC, which would otherwise create a second worker during startup.
    await page.getByText('就绪', { exact: true }).first().waitFor({ timeout: 45_000 })
    const ml = await page.evaluate(() => window.electronApi.invoke('ml:init'))
    assert.equal(ml.success, true, ml.error ?? 'Packaged ML worker could not initialize')
    await page.screenshot({ path: path.join(output, 'dashboard.png') })
    const settings = await page.evaluate(() => window.electronApi.invoke('settings:get'))
    assert.equal(settings.language, 'zh-CN')
    assert.equal(settings.streamAutostart, false)
    const stream = await page.evaluate(() => window.electronApi.invoke('stream:getStatus'))
    assert.equal(stream.status, 'stopped')
    const pairNames = seed.knownPair[0].split('|').map((name) => name.slice('ability:'.length))
    const request = {
      names: [
        ...new Set([
          ...pairNames,
          'magnataur_empower',
          'spectre_haunt',
          'weaver_shukuchi',
          'slardar_bash',
        ]),
      ],
      heroNames: ['techies'],
    }
    const ranking = await page.evaluate(
      (data) => window.electronApi.invoke('draft:getRankingData', data),
      request,
    )
    assert.equal(ranking.abilities.length, report.resources.counts.Abilities)
    assert.equal(ranking.heroes.length, report.resources.counts.Heroes)
    assert(
      ranking.abilities.some(
        (ability) =>
          ability.name === 'weaver_shukuchi' &&
          ability.highSkillWinrate > 0 &&
          ability.highSkillWinrate <= 1,
      ),
    )
    assert.deepEqual(ranking.evidence, {
      sourceDate: seed.manifest.sourceDate,
      patches: seed.manifest.patches,
    })
    assert.deepEqual(ranking.sampleCounts, seed.expectedSamples)
    const pair = ranking.pairs.find(
      (entry) =>
        [entry.ability1Name, entry.ability2Name].sort().join('|') ===
        [...pairNames].sort().join('|'),
    )
    assert(pair, 'Real ranking IPC omitted a seeded ability pair')
    assert.equal(pair.numPicks, seed.knownPair[1].numPicks)
    assert.equal(ranking.context.currentPick, null)
    assert.deepEqual(ranking.context.modelAssignments, [])
    await page.getByRole('button', { name: '英雄', exact: true }).click()
    await page.getByPlaceholder('筛选英雄...').fill('龙骑士')
    await page.getByRole('cell', { name: '龙骑士', exact: true }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: '技能', exact: true }).click()
    await page.getByPlaceholder('筛选技能...').fill('授予力量')
    await page.getByRole('cell', { name: '授予力量', exact: true }).waitFor({ timeout: 15_000 })
    assert(
      !/row\(s\)|Page \d+ of/.test(await page.locator('body').innerText()),
      'Untranslated pagination',
    )
    await page.screenshot({ path: path.join(output, 'chinese-search.png') })
    const errors = (await page.pageErrors()).map((error) => error.message)
    assert.deepEqual(errors, [], 'Renderer raised uncaught exceptions')
    report.runtime = {
      chineseDashboard: true,
      mlInitialized: true,
      chineseHeroAndAbilitySearch: true,
      rankingIPC: true,
      sampleCount: Object.keys(ranking.sampleCounts).length,
      pairSampleCount: pair.numPicks,
      sourceDate: ranking.evidence.sourceDate,
      streamAutostart: settings.streamAutostart,
      rendererErrors: errors,
    }
  }
  report.passed = true
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  if (application) {
    try {
      await application.close()
      report.applicationClosed = true
    } catch (error) {
      application.process().kill()
      report.applicationClosed = false
      report.passed = false
      report.closeError = error instanceof Error ? error.message : String(error)
      process.exitCode = 1
    }
  }
  report.verifiedAt = new Date().toISOString()
  const destination = path.join(output, 'report.json')
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n')
  console.log(
    `Public Beta ${report.mode} smoke ${report.passed ? 'passed' : 'FAILED'}: ${destination}`,
  )
  if (report.error) console.error(report.error)
}
