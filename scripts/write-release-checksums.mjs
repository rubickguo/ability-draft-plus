import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = resolve('dist')
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const setup = `Ability-Draft-Plus-CN-Beta-Setup-${version}.exe`
const files = [setup, `${setup}.blockmap`, `Ability-Draft-Plus-CN-Beta-Portable-${version}.exe`, 'beta.yml'].sort()
const lines = files.map((name) => {
  const hash = createHash('sha256').update(readFileSync(resolve(directory, name))).digest('hex')
  return `${hash}  ${name}`
})
writeFileSync(resolve(directory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)
console.log(`SHA256SUMS.txt: ${files.length} release artifacts`)
