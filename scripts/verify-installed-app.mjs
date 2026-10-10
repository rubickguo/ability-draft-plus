import { _electron as electron, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const executablePath =
  process.env.AD_PLUS_EXE ??
  'C:/Users/xiabao/AppData/Local/Programs/Dota 2 Ability Draft Plus/Dota 2 Ability Draft Plus.exe'
const refresh = process.argv.includes('--refresh-data')
const request = {
  names: ['magnataur_empower', 'spectre_haunt', 'weaver_shukuchi', 'slardar_bash'],
  heroNames: ['dragon_knight', 'techies'],
}
const app = await electron.launch({ executablePath, timeout: 30000 })
try {
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('仪表盘', { exact: true }).first().waitFor({ timeout: 20000 })
  await page.screenshot({ path: 'output/installed-dashboard.png' })
  let ranking = await page.evaluate(
    (data) => window.electronApi.invoke('draft:getRankingData', data),
    request,
  )
  assert(
    ranking.abilities.some(
      (a) => a.name === 'weaver_shukuchi' && a.highSkillWinrate > 0 && a.highSkillWinrate <= 1,
    ),
  )
  assert(ranking.heroes.some((hero) => hero.name === 'techies'))
  assert(ranking.pairs.length > 0)
  assert(Array.isArray(ranking.heroPairs))
  assert(ranking.context && Array.isArray(ranking.context.modelAssignments))
  assert(ranking.sampleCounts)
  console.log('Installed contextual ranking IPC verified')

  if (refresh) {
    const previousDate = ranking.evidence?.sourceDate ?? null
    await page.evaluate(() => window.electronApi.send('scraper:start'))
    console.log('Refreshing Windrun statistics and sample evidence through the installed app')
    await expect
      .poll(
        async () => {
          const data = await page.evaluate(
            (data) => window.electronApi.invoke('draft:getRankingData', data),
            request,
          )
          return Boolean(
            data.evidence?.sourceDate &&
            data.evidence.sourceDate !== previousDate &&
            data.sampleCounts?.['ability:weaver_shukuchi']?.highSkillNumPicks > 0 &&
            data.pairs.some((pair) => pair.numPicks > 0),
          )
        },
        { timeout: 180000, intervals: [2000] },
      )
      .toBe(true)
    ranking = await page.evaluate(
      (data) => window.electronApi.invoke('draft:getRankingData', data),
      request,
    )
    assert(ranking.evidence?.sourceDate && ranking.evidence.sourceDate !== previousDate)
    assert(ranking.sampleCounts['ability:weaver_shukuchi'].highSkillNumPicks > 0)
    assert(ranking.pairs.some((pair) => pair.numPicks > 0))
    console.log('Fresh Windrun counts verified:', JSON.stringify(ranking.evidence))
  }

  await page.getByRole('button', { name: '英雄', exact: true }).click()
  await page.getByRole('textbox').fill('龙骑士')
  await page.getByText('龙骑士', { exact: true }).first().waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: '技能', exact: true }).click()
  await page.getByRole('textbox').fill('授予力量')
  await page.getByText('授予力量', { exact: true }).first().waitFor()
  await page.screenshot({ path: 'output/installed-chinese-abilities.png' })
  assert(
    !/row\(s\)|Page \d+ of/.test(await page.locator('body').innerText()),
    'Untranslated table pagination',
  )
  assert.deepEqual(errors, [])
  fs.writeFileSync(
    'output/installed-smoke.json',
    JSON.stringify(
      {
        startup: true,
        rendererErrors: errors,
        rankingIPC: true,
        refreshedEvidence: refresh ? ranking.evidence : null,
        sampleCount: Object.values(ranking.sampleCounts).filter(
          (sample) => sample.numPicks !== null,
        ).length,
        sampledPairs: ranking.pairs.filter((pair) => pair.numPicks !== null).length,
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  )
  console.log('Installed application smoke check passed')
} finally {
  await app.close()
}
