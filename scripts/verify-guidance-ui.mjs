import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const dir = resolve('output/ui-check')
mkdirSync(dir, { recursive: true })
writeFileSync(
  `${dir}/index.html`,
  '<div id="root"></div><script type="module" src="/output/ui-check/fixture.tsx"></script>',
)
writeFileSync(
  `${dir}/fixture.tsx`,
  `
import React from 'react';import {createRoot} from 'react-dom/client';
import i18n from '/src/renderer/overlay/src/i18n';
import {HotspotLayer} from '/src/renderer/overlay/src/components/HotspotLayer';
import {TopCombinationsPanel} from '/src/renderer/overlay/src/components/TopCombinationsPanel';
import {BestChoicePanel} from '/src/renderer/overlay/src/components/BestChoicePanel';
import {buildDraftBadges} from '/src/renderer/overlay/src/draft-badges';
import {recommendDraft} from '/src/core/domain/contextual-ranking';
import {localizeDisplayData} from '/src/shared/localization/dota-names';
import '/src/renderer/overlay/src/globals.css';
window.electronApi={send(){}};await i18n.changeLanguage('zh-CN');
const skills=[['weaver_shukuchi','Shukuchi',.59],['slardar_bash','Bash of the Deep',.60],['dragon_knight_dragon_tail','Dragon Tail',.55],['sven_storm_bolt','Storm Hammer',.53]];
const slots=skills.map(([name,displayName,winrate],i)=>({name,displayName,winrate,highSkillWinrate:winrate,pickRate:5,isGeneralTopTier:true,isSynergySuggestionForMySpot:true,isPersonallyDriven:true,coord:{x:150+i*180,y:180,width:90,height:90},highWinrateCombinations:[],lowWinrateCombinations:[],strongHeroSynergies:[],weakHeroSynergies:[]}));
const owned=[{name:'magnataur_empower',displayName:'Empower',hero_order:0,is_ultimate:false,coord:{x:150,y:410,width:90,height:90}},{name:'spectre_haunt',displayName:'Haunt',hero_order:5,is_ultimate:true,coord:{x:350,y:410,width:90,height:90}}];
const raw={scaleFactor:1.5,selectedSpotHeroOrder:0,selectedModelHeroOrder:null,scanData:{ultimates:[],standard:slots,selectedAbilities:owned},heroModels:[{heroOrder:0,heroName:'dragonknight',heroDisplayName:'Dragon Knight',pickRate:10,winrate:.57,strongAbilitySynergies:[],weakAbilitySynergies:[]}],modelsCoords:[{hero_order:0,x:150,y:650,width:120,height:75}],opCombinations:[],heroSynergies:[],trapCombinations:[],heroTraps:[]};
raw.rankingData={abilities:[...slots,...owned.map(s=>({...s,winrate:.5,highSkillWinrate:.5}))],heroes:[{name:'dragonknight',winrate:.57,highSkillWinrate:.57,pickRate:10}],pairs:[{ability1Name:'weaver_shukuchi',ability2Name:'spectre_haunt',synergyWinrate:.75,synergyIncrease:.17,numPicks:600}],heroPairs:[],sampleCounts:Object.fromEntries([...slots,...owned].map(s=>['ability:'+s.name,{numPicks:5000,highSkillNumPicks:1000}])),context:{currentPick:20,rolePositions:[],modelAssignments:[]}};
const data=localizeDisplayData(raw,'zh-CN'), recommendation=recommendDraft(data),guidance=buildDraftBadges(data,recommendation);
window.fixtureRecommendation=recommendation;
document.documentElement.style.background='#172328';document.body.style.background='#172328';document.body.style.pointerEvents='auto';
createRoot(document.getElementById('root')).render(<>
<h2 style={{position:'absolute',left:90,top:30,color:'white'}}>本手决策 · 4K / 150% 验证</h2>
{slots.map((s,i)=><div key={i} style={{position:'absolute',left:s.coord.x/1.5,top:120,width:60,height:60,background:['#397054','#483576','#385d85','#947538'][i]}}/>)}
<HotspotLayer overlayData={data} selectedSpotHeroOrder={0} selectedModelHeroOrder={null} guidance={guidance}/>
<div style={{position:'absolute',left:90,top:190,color:'white'}}>缩地　　　　 深海重击　　　 神龙摆尾　　 风暴之拳</div>
<div style={{position:'absolute',left:90,top:325,color:'white'}}>自己已有：授予力量　　敌方已有：鬼影重重</div>
<div style={{position:'absolute',left:90,top:510,color:'white'}}>龙骑士（待选模型）</div>
<div style={{position:'absolute',left:720,top:85,display:'flex',flexDirection:'column',gap:10}}>
<BestChoicePanel recommendation={recommendation}/><TopCombinationsPanel recommendation={recommendation}/></div>
</>);
`,
)
const server = await createServer({
  configFile: false,
  optimizeDeps: {
    entries: ['output/ui-check/index.html'],
    include: ['react', 'react-dom/client', 'react-i18next', 'i18next'],
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { '@shared': resolve('src/shared'), '@core': resolve('src/core') },
  },
  server: { host: '127.0.0.1', port: 0 },
})
await server.listen()
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
try {
  const page = await browser.newPage({
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1.5,
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/output/ui-check/index.html`)
  await page.locator('.best-choice-title').waitFor()
  const rec = await page.evaluate(() => window.fixtureRecommendation)
  assert.equal(
    await page.locator('.best-choice-title strong').textContent(),
    rec.choices[0].displayName,
  )
  assert.equal(
    await page
      .locator(`[data-ability-name="${rec.choices[0].displayName}"] .draft-rank`)
      .textContent(),
    '1',
  )
  assert.equal(
    await page.locator('.shimmer-green,.shimmer-teal,.shimmer-gold,.personal-marker').count(),
    0,
  )
  assert((await page.locator('.top-combinations').innerText()).includes('鬼影重重'))
  assert((await page.locator('.top-combinations').innerText()).includes('缩地'))
  assert((await page.locator('.best-choice-wait').innerText()).includes('18'))
  assert.equal(await page.locator('.top-combinations li').count(), 1)
  await page.getByRole('button', { name: '隐藏组合与截胡', exact: true }).click()
  assert.equal(await page.locator('.top-combinations li').count(), 0)
  await page.getByRole('button', { name: '显示组合与截胡', exact: true }).click()
  await page.locator('[data-ability-name="缩地"]').hover()
  await page.getByRole('tooltip').waitFor()
  assert(!/Shukuchi|Haunt|Dragon Knight| WR/.test(await page.locator('body').innerText()))
  assert.equal(
    await page
      .locator('.draft-rank-top')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize),
    '20px',
  )
  assert.equal(
    await page
      .locator('.draft-focus-ring')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    'draft-rank-breathe',
  )
  await page.mouse.move(10, 10)
  await page.screenshot({
    path: `${dir}/guidance-4k-150.png`,
    clip: { x: 55, y: 20, width: 1040, height: 850 },
  })
  await page.locator('body').evaluate((el) => el.classList.add('capture-mode'))
  for (const selector of [
    '.draft-rank',
    '.draft-focus-ring',
    '.best-choice-panel',
    '.top-combinations',
  ])
    assert.equal(
      await page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).visibility),
      'hidden',
    )
  assert.deepEqual(errors, [])
  console.log(
    'PASS: unified #1, live enemy half-combo, 18-pick gap, Chinese labels, no old highlights, visibility toggle, capture hiding at 4K/150%',
  )
} finally {
  await browser.close()
  await server.close()
}
