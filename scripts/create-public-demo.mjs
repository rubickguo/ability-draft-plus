import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'

// Public-safe demonstration: synthetic inputs, actual ranking engine and overlay
// components. No game capture, user database, account name or network data.
const fixtureDir = resolve('output/public-demo')
const mediaDir = resolve('docs/media')
mkdirSync(fixtureDir, { recursive: true })
mkdirSync(mediaDir, { recursive: true })
writeFileSync(
  `${fixtureDir}/index.html`,
  '<div id="root"></div><script type="module" src="/output/public-demo/fixture.tsx"></script>',
)
writeFileSync(
  `${fixtureDir}/fixture.tsx`,
  `
import React, {useState} from 'react';import {createRoot} from 'react-dom/client';
import i18n from '/src/renderer/overlay/src/i18n';
import {BestChoicePanel} from '/src/renderer/overlay/src/components/BestChoicePanel';
import {TopCombinationsPanel} from '/src/renderer/overlay/src/components/TopCombinationsPanel';
import {DraftBadges} from '/src/renderer/overlay/src/components/DraftBadges';
import {recommendDraft} from '/src/core/domain/contextual-ranking';
import {buildDraftBadges} from '/src/renderer/overlay/src/draft-badges';
import {localizeDisplayData} from '/src/shared/localization/dota-names';
import '/src/renderer/overlay/src/globals.css';
window.electronApi={send(){}};await i18n.changeLanguage('zh-CN');
const skills=[
 ['weaver_shukuchi','缩地',.61,'迹','#34bdd2'],
 ['slardar_bash','深海重击',.602,'击','#7b8ceb'],
 ['dragon_knight_dragon_tail','神龙摆尾',.57,'龙','#e2a159'],
 ['sven_storm_bolt','风暴之拳',.565,'雷','#76bfeb'],
 ['magnataur_empower','授予力量',.575,'力','#d291e7'],
 ['weaver_geminate_attack','连击',.595,'连','#51cba9'],
];
const models=[['dragonknight','龙骑士',.56,'龙','#e18b61'],['sniper','狙击手',.551,'准','#b8c87b']];
const slots=skills.map(([name,displayName,winrate,glyph,color],i)=>({name,displayName,winrate,highSkillWinrate:winrate,pickRate:5,isUnknown:false,is_ultimate:false,glyph,color,coord:{x:i*100,y:0,width:80,height:80},highWinrateCombinations:[],lowWinrateCombinations:[],strongHeroSynergies:[],weakHeroSynergies:[]}));
const enemy={name:'spectre_haunt',displayName:'鬼影重重',hero_order:0,isUnknown:false,is_ultimate:true,coord:{x:10,y:500,width:50,height:50}};
const stages=[
 {label:'识别技能池',heading:'先给一个明确答案',detail:'技能与模型放在同一个池子里排名。',event:'等待补充自己的席位和模型'},
 {label:'选择我的模型',heading:'模型确定，首选随之改变',detail:'选择龙骑士后，按模型搭配重新评估；其他模型退出候选。',event:'已设定：我的席位在夜魇第1行 · 我的模型为龙骑士'},
 {label:'识别我的技能',heading:'已有组件，优先补全搭配',detail:'识别到授予力量后，重新比较剩余技能的自身收益。',event:'自己已选：龙骑士 + 授予力量'},
 {label:'再次识别',heading:'被选走的技能退出，重新给答案',detail:'连击已被别人选走，角标连续重排，首选同步更新。',event:'重新识别：连击被选走 · 已从候选中排除'},
];
function Demo(){
 const [stage,setStage]=useState(0);
 const own=stage>=2?[{...slots[4],hero_order:5}]:[];
 const picked=stage>=3?[{...slots[5],hero_order:4}]:[];
 const raw={scaleFactor:1,selectedSpotHeroOrder:stage?5:null,selectedModelHeroOrder:stage?0:null,
 scanData:{ultimates:[],standard:slots,selectedAbilities:[enemy,...own,...picked]},
 heroModels:models.map(([heroName,heroDisplayName,winrate],i)=>({heroOrder:i,heroName,heroDisplayName,winrate,highSkillWinrate:winrate,isPicked:stage>0&&i===0,pickRate:12,strongAbilitySynergies:[],weakAbilitySynergies:[]})),
 modelsCoords:[],opCombinations:[],heroSynergies:[],trapCombinations:[],heroTraps:[],
 rankingData:{abilities:[...slots,{...enemy,winrate:.52,highSkillWinrate:.52}],heroes:models.map(([name,displayName,winrate])=>({name,displayName,winrate,highSkillWinrate:winrate,pickRate:12})),
 pairs:[{ability1Name:'weaver_shukuchi',ability2Name:'spectre_haunt',synergyWinrate:.75,synergyIncrease:.18,numPicks:600},{ability1Name:'magnataur_empower',ability2Name:'weaver_geminate_attack',synergyWinrate:.78,synergyIncrease:.2,numPicks:900}],
 heroPairs:[{heroName:'dragonknight',abilityName:'magnataur_empower',synergyWinrate:.75,synergyIncrease:.18,numPicks:800}],
 sampleCounts:Object.fromEntries([...slots.map(s=>['ability:'+s.name,{numPicks:6000,highSkillNumPicks:1200}]),...models.map(([n])=>['hero:'+n,{numPicks:6000,highSkillNumPicks:1200}])]),
 context:{currentPick:stage>=2?15:6,rolePositions:[],roleMode:'off',modelAssignments:stage?[{playerIndex:5,heroName:'dragonknight'}]:[]}}};
 const data=localizeDisplayData(raw,'zh-CN'),recommendation=recommendDraft(data),guidance=buildDraftBadges(data,recommendation);
 window.demoRecommendation=recommendation;window.demoStage=stage;
 const cards=[...slots.map(s=>({...s,kind:'ability',guidance:guidance.abilities.get(s.name)})),...models.map(([name,displayName,winrate,glyph,color],i)=>({name,displayName,glyph,color,kind:'hero',guidance:guidance.models.get(i)}))];
 return <main className="demo-page">
 <header className="demo-header"><div><div className="demo-eyebrow">ABILITY DRAFT PLUS <b>CN BETA</b></div><h1>本手选谁？<span>给你一个清晰答案。</span></h1></div><div className="demo-label">演示数据 · 非实战</div></header>
 <div className="demo-layout"><section className="demo-board"><div className="demo-board-heading"><span className="demo-step">0{stage+1}</span><div><h2>{stages[stage].heading}</h2><p>{stages[stage].detail}</p></div></div>
 <div className="demo-cards">{cards.map(card=><article key={card.name} data-name={card.name} className={'demo-card '+(!card.guidance?.rank?'demo-card-unavailable':'')} style={{'--card-color':card.color} as React.CSSProperties}><div className="demo-symbol">{card.glyph}</div><div className="demo-card-name">{card.displayName}</div><DraftBadges guidance={card.guidance}/>{!card.guidance?.rank&&<span className="demo-unavailable">{card.kind==='hero'?(card.name==='dragonknight'?'我的模型':'不再候选'):'已选走'}</span>}</article>)}</div>
 <div className="demo-event"><span className="demo-event-dot"/><div>{stages[stage].event}</div></div>
 <div className="demo-team"><div><span>自己</span><strong>{stage>=2?'龙骑士 + 授予力量':stage?'龙骑士':'信息未指定'}</strong></div><div><span>敌方已选</span><strong>鬼影重重{stage>=3?' · 连击已离开池子':''}</strong></div></div>
 </section><aside className="demo-sidebar"><BestChoicePanel recommendation={recommendation}/><TopCombinationsPanel recommendation={recommendation}/></aside></div>
 <footer><nav className="demo-progress">{stages.map((item,i)=><button key={i} data-stage={i} className={stage===i?'active':''} onClick={()=>setStage(i)}><span>{i+1}</span>{item.label}</button>)}</nav><p className="demo-disclaimer">构造数据 + 实际推荐引擎与界面组件 · 非实战截图，数值仅演示交互，不代表当前版本强度</p></footer>
 </main>
}
createRoot(document.getElementById('root')).render(<Demo/>);
`,
)
writeFileSync(
  `${fixtureDir}/demo.css`,
  `
*{box-sizing:border-box}html,body{margin:0;width:1280px;height:850px;overflow:hidden;background:#0b111b;color:#e8edf5;font-family:'Segoe UI','Microsoft YaHei',sans-serif;pointer-events:auto}.demo-page{pointer-events:auto;padding:34px 40px 22px;background:radial-gradient(ellipse at 25% 10%,#21334677,transparent 65%);height:850px}.demo-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}.demo-eyebrow{font-size:12px;letter-spacing:2px;color:#99aabd}.demo-eyebrow b{margin-left:8px;color:#72d7cd;letter-spacing:1px}h1{font-size:32px;line-height:1.4;letter-spacing:-.5px;margin:9px 0 0;font-weight:800}h1 span{color:#9eaec3;font-size:24px;margin-left:12px;font-weight:500}.demo-label{border:1px solid #956635;background:#3c2b1744;padding:8px 12px;border-radius:30px;color:#e4b882;font-size:12px}.demo-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:30px;height:588px}.demo-board{border:1px solid #344353;border-radius:15px;background:#111b29c0;padding:24px}.demo-board-heading{display:flex;align-items:center;gap:14px}.demo-step{font-size:30px;color:#63d7c5;font-weight:700;font-variant-numeric:tabular-nums}.demo-board-heading h2{font-size:20px;margin:0 0 5px}.demo-board-heading p{font-size:12px;color:#a8b5c5;margin:0;line-height:1.5}.demo-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:23px 19px;margin:31px 4px 24px}.demo-card{height:141px;position:relative;border-radius:8px;border:1px solid color-mix(in srgb,var(--card-color),#1a2230 50%);background:linear-gradient(140deg,color-mix(in srgb,var(--card-color),#0e1521 84%),#0e1521);display:flex;align-items:center;justify-content:center;flex-direction:column;transition:opacity .2s}.demo-symbol{font-size:34px;color:var(--card-color);font-weight:800;text-shadow:0 0 25px color-mix(in srgb,var(--card-color),transparent 65%)}.demo-card-name{font-size:14px;margin-top:9px;white-space:nowrap;font-weight:650}.demo-card .draft-rank{top:-9px;left:-7px}.demo-card .draft-focus-ring{inset:-2px;opacity:.65}.demo-card-unavailable{opacity:.33}.demo-unavailable{position:absolute;bottom:7px;font-size:10px;color:#d8e0e8}.demo-card-unavailable .demo-card-name{margin-top:2px}.demo-card-unavailable .demo-symbol{font-size:27px}.demo-event{display:flex;align-items:center;gap:10px;background:#1b303744;border:1px solid #395059;border-radius:8px;padding:12px;font-size:12px;color:#beded8;min-height:44px}.demo-event-dot{width:6px;height:6px;border-radius:100%;background:#64d7c0;flex-shrink:0}.demo-team{display:flex;justify-content:space-between;font-size:11px;margin-top:18px;color:#a1aec0;gap:10px}.demo-team div{display:flex;flex-direction:column;gap:6px}.demo-team strong{color:#d6dfeb;font-size:12px}.demo-sidebar{display:flex;flex-direction:column;gap:12px}.demo-sidebar .best-choice-panel,.demo-sidebar .top-combinations{width:320px}.demo-sidebar .top-combinations-content{max-height:290px}.demo-sidebar .best-choice-notes{font-size:10px}.demo-sidebar .best-choice-heading>span{font-size:9px}.demo-sidebar .threat-reason{font-size:10px}.demo-progress{display:flex;gap:12px;margin-top:22px}.demo-progress button{color:#9daec3;background:#141e2d;border:1px solid #2a3a50;border-radius:8px;padding:9px 16px;display:flex;align-items:center;gap:9px;font-size:12px;flex:1;cursor:pointer}.demo-progress button span{font-size:12px;line-height:20px;width:20px;border-radius:100%;background:#26374b;text-align:center}.demo-progress button.active{border-color:#62bead;color:#defff5;background:#17332f}.demo-progress button.active span{color:#05251f;background:#6bd5bd}.demo-disclaimer{font-size:10px;letter-spacing:.2px;color:#7b8da5;text-align:center;margin:12px 0 0}
`,
)
const html = '<link rel="icon" href="data:,"><link rel="stylesheet" href="/output/public-demo/demo.css">'
writeFileSync(
  `${fixtureDir}/index.html`,
  html +
    '<div id="root"></div><script type="module" src="/output/public-demo/fixture.tsx"></script>',
)
const server = await createServer({
  configFile: false,
  optimizeDeps: {
    entries: ['output/public-demo/index.html'],
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
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const results = []
const frameDir = `${fixtureDir}/frames`
mkdirSync(frameDir, { recursive: true })
let frameNumber = 0
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage(),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/output/public-demo/index.html`,
  )
  await page.locator('.best-choice-title').waitFor()
  for (let stage = 0; stage < 4; stage++) {
    if (stage) await page.locator(`[data-stage="${stage}"]`).click()
    await page.waitForFunction((s) => window.demoStage === s, stage)
    await page.mouse.move(1255, 825)
    const rec = await page.evaluate(() => window.demoRecommendation)
    const name = await page.locator('.best-choice-title strong').textContent()
    assert.equal(name, rec.choices[0].displayName)
    assert.equal(
      await page.locator(`[data-name="${rec.choices[0].name}"] .draft-rank`).textContent(),
      '1',
    )
    if (stage >= 1)
      assert.equal(
        rec.choices.some((c) => c.kind === 'hero'),
        false,
      )
    if (stage >= 2)
      assert.equal(
        rec.choices.some((c) => c.name === 'magnataur_empower'),
        false,
      )
    if (stage >= 3)
      assert.equal(
        rec.choices.some((c) => c.name === 'weaver_geminate_attack'),
        false,
      )
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth,
      y: document.documentElement.scrollHeight,
      panelBottom: document.querySelector('.top-combinations').getBoundingClientRect().bottom,
    }))
    assert.equal(overflow.x, 1280)
    assert.equal(overflow.y, 850)
    assert(overflow.panelBottom < 750)
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${fixtureDir}/stage-${stage}.png` })
    results.push({ stage, best: name, choiceCount: rec.choices.length, notes: rec.notes })
    for (let frame = 0; frame < 18; frame++) {
      const start = Date.now()
      await page.screenshot({
        path: `${frameDir}/frame-${String(frameNumber++).padStart(4, '0')}.jpg`,
        type: 'jpeg',
        quality: 90,
      })
      await page.waitForTimeout(Math.max(0, 167 - (Date.now() - start)))
    }
  }
  assert.equal(
    new Set(results.map((r) => r.best)).size >= 3,
    true,
    'model and owned-skill inputs should visibly change the best choice',
  )
  assert.deepEqual(errors, [])
  await context.close()
} finally {
  await browser.close()
  await server.close()
}
copyFileSync(`${fixtureDir}/stage-1.png`, `${mediaDir}/recommendation-demo.png`)
const ffmpeg = process.env.FFMPEG_PATH || 'C:/Program Files/ffmpeg/bin/ffmpeg.exe'
const videoPath = `${mediaDir}/recommendation-demo.webm`
execFileSync(ffmpeg, [
  '-y',
  '-loglevel',
  'error',
  '-framerate',
  '6',
  '-i',
  `${frameDir}/frame-%04d.jpg`,
  '-frames:v',
  String(frameNumber),
  '-c:v',
  'libvpx-vp9',
  '-b:v',
  '0',
  '-crf',
  '28',
  '-pix_fmt',
  'yuv420p',
  videoPath,
])
execFileSync(ffmpeg, [
  '-y',
  '-loglevel',
  'error',
  '-i',
  videoPath,
  '-vf',
  'fps=6,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4',
  '-loop',
  '0',
  `${mediaDir}/recommendation-demo.gif`,
])
writeFileSync(
  `${fixtureDir}/verification.json`,
  JSON.stringify({ syntheticData: true, actualComponents: true, stages: results }, null, 2) + '\n',
)
console.log(
  JSON.stringify(
    {
      message:
        'PASS: four real-engine stages, unified ranks, model/selected-skill exclusions, no overflow or browser errors',
      results,
      mediaDir,
    },
    null,
    2,
  ),
)
