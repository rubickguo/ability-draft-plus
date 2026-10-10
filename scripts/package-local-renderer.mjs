import asar from '@electron/asar'
import pickle from 'chromium-pickle-js'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { build as bundle } from 'esbuild'
import { patchInstalledMain } from './patch-installed-main.mjs'

const original = process.argv[2]
if (!original) throw new Error('Usage: node scripts/package-local-renderer.mjs <original app.asar>')
const output = path.resolve('output/patched/app.asar')
const build = path.resolve('out/renderer')
const hash = (b) => createHash('sha256').update(b).digest('hex')
const source = fs.readFileSync(original)
const raw = asar.getRawHeader(original)
const header = structuredClone(raw.header)
// Preserve ALL old payload bytes and native unpack metadata, including optional
// non-Windows unpack entries absent from the Windows installation. Only the
// renderer directory, five precise main edits and the ranking sidecar are
// replaced/appended. Recognition code and the remaining payload stay intact.
const payload = source.subarray(8 + raw.headerSize)
const chunks = [payload]
let offset = payload.length
let rendererFiles = 0
function walkBuild(dir) {
  const files = {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) files[entry.name] = { files: walkBuild(file) }
    else {
      const bytes = fs.readFileSync(file)
      const blockSize = 4 * 1024 * 1024
      const blocks = []
      for (let i = 0; i < bytes.length; i += blockSize)
        blocks.push(hash(bytes.subarray(i, i + blockSize)))
      if (!blocks.length) blocks.push(hash(bytes))
      files[entry.name] = {
        size: bytes.length,
        offset: String(offset),
        integrity: { algorithm: 'SHA256', hash: hash(bytes), blockSize, blocks },
      }
      chunks.push(bytes)
      offset += bytes.length
      rendererFiles++
    }
  }
  return files
}
header.files.out.files.renderer = { files: walkBuild(build) }
// Bundle the data provider; preserve installed recognition and native code.
const originalMain = asar
  .extractFile(original, path.normalize('out/main/index.js'))
  .toString('utf8')
const { updated: updatedMain, edits: mainEdits } = patchInstalledMain(originalMain)
const extension = await bundle({
  entryPoints: ['src/main/services/draft-ranking-data.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  packages: 'external',
  alias: { '@core': path.resolve('src/core'), '@shared': path.resolve('src/shared') },
})
const extensionBytes = extension.outputFiles[0].contents
const extensionBlockSize = 4 * 1024 * 1024,
  extensionBlocks = []
for (let i = 0; i < extensionBytes.length; i += extensionBlockSize)
  extensionBlocks.push(hash(extensionBytes.subarray(i, i + extensionBlockSize)))
header.files.out.files.main.files['contextual-ranking-extension.cjs'] = {
  size: extensionBytes.length,
  offset: String(offset),
  integrity: {
    algorithm: 'SHA256',
    hash: hash(extensionBytes),
    blockSize: extensionBlockSize,
    blocks: extensionBlocks,
  },
}
chunks.push(extensionBytes)
offset += extensionBytes.length
const mainBytes = Buffer.from(updatedMain)
const mainBlockSize = 4 * 1024 * 1024
const mainBlocks = []
for (let i = 0; i < mainBytes.length; i += mainBlockSize)
  mainBlocks.push(hash(mainBytes.subarray(i, i + mainBlockSize)))
header.files.out.files.main.files['index.js'] = {
  size: mainBytes.length,
  offset: String(offset),
  integrity: {
    algorithm: 'SHA256',
    hash: hash(mainBytes),
    blockSize: mainBlockSize,
    blocks: mainBlocks,
  },
}
chunks.push(mainBytes)
offset += mainBytes.length
const hp = pickle.createEmpty()
hp.writeString(JSON.stringify(header))
const sp = pickle.createEmpty()
sp.writeUInt32(hp.toBuffer().length)
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, Buffer.concat([sp.toBuffer(), hp.toBuffer(), ...chunks]))
asar.uncache(output)
let untouched = 0,
  unpacked = 0
function verify(entries, parent = '') {
  for (const [name, entry] of Object.entries(entries)) {
    const file = parent ? `${parent}/${name}` : name
    if (file === 'out/renderer' || file === 'out/main/index.js') continue
    if (entry.files) verify(entry.files, file)
    else {
      assert.deepEqual(
        asar.statFile(output, path.normalize(file), false),
        entry,
        `Metadata changed: ${file}`,
      )
      if (!entry.unpacked && !entry.link)
        assert.equal(
          hash(asar.extractFile(original, path.normalize(file))),
          hash(asar.extractFile(output, path.normalize(file))),
          `Bytes changed: ${file}`,
        )
      if (entry.unpacked) unpacked++
      untouched++
    }
  }
}
verify(raw.header.files)
assert.equal(
  asar.extractFile(output, path.normalize('out/main/index.js')).toString('utf8'),
  updatedMain,
)
assert.equal(
  hash(asar.extractFile(output, path.normalize('out/main/contextual-ranking-extension.cjs'))),
  hash(extensionBytes),
)
function verifyBuild(dir, parent = 'out/renderer') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name),
      destination = path.join(parent, entry.name)
    if (entry.isDirectory()) verifyBuild(file, destination)
    else assert.equal(hash(asar.extractFile(output, destination)), hash(fs.readFileSync(file)))
  }
}
verifyBuild(build)
fs.writeFileSync(
  path.resolve('output/package-verification.json'),
  JSON.stringify(
    {
      original,
      output,
      unchangedFilesVerified: untouched,
      unpackedEntriesPreserved: unpacked,
      rendererFiles,
      mainPatch:
        mainEdits +
        ' reversible recommendation/evidence/own-pick edits; original recognition unchanged',
      originalSha256: hash(source),
      patchedSha256: hash(fs.readFileSync(output)),
      verifiedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
)
console.log(
  `Verified: ${untouched} original entries unchanged (${unpacked} unpacked references preserved); ${rendererFiles} renderer files replaced. Package: ${output}`,
)
