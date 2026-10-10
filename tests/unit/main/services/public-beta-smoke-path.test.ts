import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getPublicBetaSmokeAppData } from '../../../../src/main/services/public-beta-smoke-path'

const temporaryDirectories: string[] = []
function temporary(prefix: string, parent = tmpdir()): string {
  const directory = mkdtempSync(join(parent, prefix))
  temporaryDirectories.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of temporaryDirectories.reverse())
    rmSync(directory, { recursive: true, force: true })
  temporaryDirectories.length = 0
})

describe('public Beta smoke profile isolation', () => {
  it('ignores the environment override without the explicit smoke switch', () => {
    expect(getPublicBetaSmokeAppData(false, '/not/a/test/path')).toBeNull()
  })
  it('requires a profile directory when the smoke switch is enabled', () => {
    expect(() => getPublicBetaSmokeAppData(true, undefined)).toThrow('temporary profile')
  })
  it('accepts only a fresh smoke directory directly within the OS temporary directory', () => {
    const directory = temporary('adp-public-beta-smoke-')
    expect(getPublicBetaSmokeAppData(true, directory)).toBe(realpathSync(directory))
  })
  it('rejects other directories and nested smoke lookalikes', () => {
    const directory = temporary('adp-not-smoke-')
    expect(() => getPublicBetaSmokeAppData(true, directory)).toThrow('temporary profile')
    const nested = temporary('adp-public-beta-smoke-', directory)
    expect(() => getPublicBetaSmokeAppData(true, nested)).toThrow('temporary profile')
  })
})
