import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const base = 'src/renderer/overlay/src/locales'
for (const lang of readdirSync(base)) {
  const file = `${base}/${lang}/overlay.json`
  const data = JSON.parse(readFileSync(file, 'utf8'))
  data.badges = lang === 'zh-CN' ? {
    rankTitle: '选取顺序排名 #{{rank}}（越小通常越早被抢）',
    legend: '#数字：平均选取顺序排名，技能与模型各自排序；紫色相同字母：同一强力组合。排名不代表胜率。',
    combinations: '可搭配的强力组合',
  } : {
    rankTitle: 'Pick-order rank #{{rank}} (lower is usually drafted earlier)',
    legend: '# = average pick-order rank; abilities and models ranked separately. Matching purple letters = strong combo. Rank is not win rate.',
    combinations: 'Available strong combinations',
  }
  if (lang === 'zh-CN') data.tooltip.pickRate = '平均选取顺序：{{value}}'
  if (lang === 'en') data.tooltip.pickRate = 'Average pick position: {{value}}'
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}
const dataFile = 'src/renderer/control-panel/src/locales/zh-CN/data.json'
const data = JSON.parse(readFileSync(dataFile, 'utf8'))
data.abilities.columns.pickRate = '平均选取顺序'
data.heroes.columns.pickRate = '平均选取顺序'
data.heroes.columns.hsPickRate = '高分段平均选取顺序'
writeFileSync(dataFile, JSON.stringify(data, null, 2) + '\n')
for (const lang of readdirSync('src/renderer/control-panel/src/locales')) {
  const path = `src/renderer/control-panel/src/locales/${lang}/common.json`
  const common = JSON.parse(readFileSync(path, 'utf8'))
  common.close ??= lang === 'zh-CN' ? '关闭' : 'Close'
  writeFileSync(path, JSON.stringify(common, null, 2) + '\n')
}
const tooltip = 'src/renderer/overlay/src/components/Tooltip.tsx'
writeFileSync(tooltip, readFileSync(tooltip, 'utf8').replaceAll("'N/A'", "'—'").replaceAll(')} WR)', ')})'))
