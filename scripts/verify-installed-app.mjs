import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
const app = await electron.launch({executablePath:'C:/Users/xiabao/AppData/Local/Programs/Dota 2 Ability Draft Plus/Dota 2 Ability Draft Plus.exe',timeout:30000})
try {
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForLoadState('domcontentloaded');
 await page.getByText('仪表盘',{exact:true}).first().waitFor({timeout:20000});
 await page.screenshot({path:'output/installed-dashboard.png'});
 const ranking=await page.evaluate(()=>window.electronApi.invoke('draft:getRankingData',{names:['magnataur_empower','spectre_haunt','weaver_shukuchi','slardar_bash']}));
 if(!ranking.abilities.some(a=>a.name==='weaver_shukuchi' && a.highSkillWinrate > .6) || !ranking.heroes.some(h=>h.name==='techies')) throw new Error('Ranking statistics missing');
 if(!Array.isArray(ranking.pairs) || ranking.pairs.length===0) throw new Error('Recorded pool pairs missing');
 console.log('Ranking IPC verified:',ranking.abilities.length,'abilities,',ranking.heroes.length,'models,',ranking.pairs.length,'pool pairs');

 console.log('APP WINDOWS',await Promise.all(app.windows().map(p=>p.url())));
 console.log('BODY', (await page.locator('body').innerText()).slice(0,1600));
 const heroes=page.getByRole('button',{name:'英雄',exact:true});
 if(await heroes.count()){await heroes.click();await page.getByRole('textbox').fill('龙骑士');await page.getByText('龙骑士',{exact:true}).first().waitFor({timeout:15000}); console.log('Official Chinese hero name verified in installed app table');}
 await page.getByRole('button',{name:'技能',exact:true}).click();await page.getByRole('textbox').fill('授予力量');await page.getByText('授予力量',{exact:true}).first().waitFor();await page.screenshot({path:'output/installed-chinese-abilities.png'});
 if(/row\(s\)|Page \d+ of/.test(await page.locator('body').innerText())) throw new Error('Untranslated table pagination');
 if(errors.length) throw new Error(errors.join('\n'));
 fs.writeFileSync('output/installed-smoke.json',JSON.stringify({startup:true,rendererErrors:errors,verifiedAt:new Date().toISOString()},null,2));
} finally {await app.close()}
