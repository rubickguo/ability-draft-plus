import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

// Self-contained fixture, no game or user browser session required.
const dir = resolve('output/ui-check')
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/index.html`, '<div id="root"></div><script type="module" src="/output/ui-check/fixture.tsx"></script>')
writeFileSync(`${dir}/fixture.tsx`, `
import React from 'react'; import {createRoot} from 'react-dom/client';
import i18n from '/src/renderer/overlay/src/i18n';
import {HotspotLayer} from '/src/renderer/overlay/src/components/HotspotLayer';
import {TopCombinationsPanel} from '/src/renderer/overlay/src/components/TopCombinationsPanel';
import {DraftBadges} from '/src/renderer/overlay/src/components/DraftBadges';
import {CombinationPanel} from '/src/renderer/overlay/src/components/CombinationPanel';
import {buildDraftBadges} from '/src/renderer/overlay/src/draft-badges';
import {localizeDisplayData} from '/src/shared/localization/dota-names';
import '/src/renderer/overlay/src/globals.css';
window.electronApi={send(){}};
await i18n.changeLanguage('zh-CN');
const skills=[['magnataur_empower','Empower',8.51],['spectre_haunt','Haunt',2],['dragon_knight_dragon_tail','Dragon Tail',4]];
const slots=skills.map(([name,displayName,pickRate],i)=>({name,displayName,pickRate,winrate:.553,isGeneralTopTier:true,isPersonallyDriven:true,goodShard:true,goodScepter:true,coord:{x:150+i*180,y:180,width:90,height:90},highWinrateCombinations:[],lowWinrateCombinations:[],strongHeroSynergies:[],weakHeroSynergies:[]}));
const raw={scaleFactor:1.5,selectedSpotHeroOrder:0,selectedModelHeroOrder:null,scanData:{ultimates:[],standard:slots,selectedAbilities:[]},heroModels:[{heroOrder:0,heroName:'dragonknight',heroDisplayName:'Dragon Knight',pickRate:3,winrate:.54,strongAbilitySynergies:[],weakAbilitySynergies:[]}],modelsCoords:[{hero_order:0,x:150,y:390,width:120,height:75}],opCombinations:[{ability1Name:'magnataur_empower',ability2Name:'spectre_haunt',ability1DisplayName:'Empower',ability2DisplayName:'Haunt',synergyWinrate:.61}],heroSynergies:[{heroDisplayName:'Dragon Knight',abilityDisplayName:'Empower',synergyWinrate:.58}],trapCombinations:[],heroTraps:[]};
raw.rankingData={abilities:slots.map(s=>({...s,highSkillWinrate:.6})),heroes:[],pairs:[{ability1Name:'magnataur_empower',ability2Name:'spectre_haunt',synergyWinrate:.61},{ability1Name:'dragon_knight_dragon_tail',ability2Name:'spectre_haunt',synergyWinrate:.57}]};
const data=localizeDisplayData(raw,'zh-CN');
document.documentElement.style.background='#18282b';
document.body.style.background='#18282b';document.body.style.pointerEvents='auto';
createRoot(document.getElementById('root')).render(<>
<h2 style={{position:'absolute',left:90,top:40,color:'white'}}>4K / 150% · 中文与角标检查</h2>
{slots.map((s,i)=><div key={i} style={{position:'absolute',left:s.coord.x/1.5,top:120,width:60,height:60,background:['#397054','#483576','#385d85'][i]}}/>)}
<HotspotLayer overlayData={data} selectedSpotHeroOrder={0} selectedModelHeroOrder={null}/>
<div style={{position:'absolute',left:90,top:190,color:'white'}}>授予力量　　　　 鬼影重重　　　　 神龙摆尾</div>
<div style={{position:'absolute',left:90,top:325,color:'white'}}>龙骑士（模型）</div>
<div style={{position:'absolute',left:560,top:110,width:360}}><CombinationPanel variant="op" visible onToggle={()=>{}} abilityCombinations={data.opCombinations} heroSynergies={data.heroSynergies} groups={buildDraftBadges(data).groups}/></div>
<div style={{position:'absolute',left:560,top:350}}><TopCombinationsPanel data={data}/></div>
<div id="rank-four" style={{position:'absolute',left:420,top:270}}><DraftBadges guidance={{rank:4,kind:'ability',groups:[]}}/></div>
</>);
`)
const server = await createServer({ configFile:false, optimizeDeps:{entries:['output/ui-check/index.html'],include:['react','react-dom/client','react-i18next','i18next']}, plugins:[react(),tailwindcss()], resolve:{dedupe:['react','react-dom'],alias:{'@shared':resolve('src/shared')}},server:{host:'127.0.0.1',port:0} })
await server.listen()
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true})
try {
  const page = await browser.newPage({viewport:{width:2560,height:1440},deviceScaleFactor:1.5})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/output/ui-check/index.html`)
  await page.locator('[data-ability-name="授予力量"]').waitFor()
  assert.equal(await page.locator('[data-ability-name="鬼影重重"] .draft-rank').textContent(),'1')
  assert.equal(await page.locator('[data-hero-name="龙骑士"] .draft-rank').textContent(),'3')
  assert.deepEqual(await page.locator('[data-ability-name="授予力量"] .draft-combo-badge').allTextContents(),['A','B'])
  assert.equal(await page.locator('#rank-four .draft-rank-ten').textContent(),'4')
  assert.equal(await page.locator('.draft-focus-ring').first().evaluate(el=>getComputedStyle(el).animationName),'draft-rank-breathe')
  assert.equal(await page.locator('.draft-rank-top').first().evaluate(el=>getComputedStyle(el).fontSize),'20px')
  assert.equal(await page.locator('.top-combinations li').count(),2)
  await page.getByRole('button',{name:'隐藏组合胜率前十',exact:true}).click()
  assert.equal(await page.locator('.top-combinations li').count(),0)
  await page.getByRole('button',{name:'显示组合胜率前十',exact:true}).click()
  assert.equal(await page.locator('.top-combinations li').count(),2)
  await page.locator('[data-ability-name="授予力量"]').hover()
  await page.getByRole('tooltip').waitFor()
  const tooltip=await page.getByRole('tooltip').textContent()
  assert(tooltip.includes('授予力量 + 鬼影重重'))
  assert(!/Empower|Haunt|Dragon Knight| WR/.test(await page.locator('body').innerText()))
  await page.screenshot({path:`${dir}/guidance-4k-150.png`,clip:{x:60,y:25,width:920,height:660}})
  await page.locator('body').evaluate(el=>el.classList.add('capture-mode'))
  assert.equal(await page.locator('.draft-rank').first().evaluate(el=>getComputedStyle(el).visibility),'hidden')
  assert.equal(await page.locator('.draft-focus-ring').first().evaluate(el=>getComputedStyle(el).visibility),'hidden')
  assert.deepEqual(errors,[])
  console.log('PASS: 4K/150% geometry, skill/model ranks, shared combo letters, official Chinese tooltip, scan capture hiding, no browser errors')
} finally { await browser.close(); await server.close() }
